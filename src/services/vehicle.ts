import { prisma } from '../config/database';
import { CentralWebSocketServer } from '../websocket/WebSocketServer';

export interface DriverVehicleRequest {
  // Driver info
  cin: string;
  phoneNumber: string;
  firstName: string;
  lastName: string;
  originGovernorateId: string;
  originDelegationId: string;
  originAddress?: string;

  // Vehicle info
  licensePlate: string;
  capacity: number;
  model?: string;
  year?: number;
  color?: string;

  // Authorized stations - stations this vehicle can work between
  authorizedStationIds: string[];
}

export interface VehicleApprovalData {
  supervisorId: string;
  approved: boolean;
  rejectionReason?: string;
}

/**
 * Service class for handling vehicles and driver requests
 */
export class VehicleService {

  /**
   * Find the closest station to given governorate/delegation
   */
  async findClosestStation(governorateId: string, delegationId: string) {
    // First try to find a station in the same delegation
    let station = await prisma.station.findFirst({
      where: {
        delegationId,
        isActive: true
      },
      include: {
        governorate: true,
        delegation: true
      }
    });

    // If no station in delegation, find one in the same governorate
    if (!station) {
      station = await prisma.station.findFirst({
        where: {
          governorateId,
          isActive: true
        },
        include: {
          governorate: true,
          delegation: true
        }
      });
    }

    return station;
  }

  /**
   * Submit a driver account request with vehicle info
   */
  async submitDriverRequest(requestData: DriverVehicleRequest) {
    // Validate input
    if (!requestData.authorizedStationIds || requestData.authorizedStationIds.length < 2) {
      throw new Error('Vehicle must be authorized for at least 2 stations to operate between them');
    }

    // Check if CIN or license plate already exists
    const existingDriver = await prisma.driver.findUnique({
      where: { cin: requestData.cin }
    });

    if (existingDriver) {
      throw new Error('Driver with this CIN already exists');
    }

    const existingVehicle = await prisma.vehicle.findUnique({
      where: { licensePlate: requestData.licensePlate }
    });

    if (existingVehicle) {
      throw new Error('Vehicle with this license plate already exists');
    }

    // Validate that all authorized stations exist and are active
    const authorizedStations = await prisma.station.findMany({
      where: {
        id: { in: requestData.authorizedStationIds },
        isActive: true
      }
    });

    if (authorizedStations.length !== requestData.authorizedStationIds.length) {
      throw new Error('One or more authorized stations are invalid or inactive');
    }

    // Find closest station for driver assignment
    const assignedStation = await this.findClosestStation(
      requestData.originGovernorateId,
      requestData.originDelegationId
    );

    if (!assignedStation) {
      throw new Error('No active station found for this location');
    }

    // Create vehicle with authorized stations in a transaction
    const result = await prisma.$transaction(async (tx) => {
      // Create vehicle first
      const vehicle = await tx.vehicle.create({
        data: {
          licensePlate: requestData.licensePlate,
          capacity: requestData.capacity,
          model: requestData.model || null,
          year: requestData.year || null,
          color: requestData.color || null,
          isActive: false, // Will be activated after approval
          isAvailable: false
        }
      });

      // Create authorized stations relationships
      const authorizedStationData = requestData.authorizedStationIds.map(stationId => ({
        vehicleId: vehicle.id,
        stationId: stationId
      }));

      await tx.vehicleAuthorizedStation.createMany({
        data: authorizedStationData
      });

      // Create driver with vehicle linked
      const driver = await tx.driver.create({
        data: {
          cin: requestData.cin,
          phoneNumber: requestData.phoneNumber,
          firstName: requestData.firstName,
          lastName: requestData.lastName,
          originGovernorateId: requestData.originGovernorateId,
          originDelegationId: requestData.originDelegationId,
          originAddress: requestData.originAddress || null,
          assignedStationId: assignedStation.id,
          vehicleId: vehicle.id,
          accountStatus: 'PENDING',
          isActive: false
        },
        include: {
          originGovernorate: true,
          originDelegation: true,
          assignedStation: {
            include: {
              governorate: true,
              delegation: true
            }
          },
          vehicle: {
            include: {
              authorizedStations: {
                include: {
                  station: {
                    include: {
                      governorate: true,
                      delegation: true
                    }
                  }
                }
              }
            }
          }
        }
      });

      return driver;
    });

    return {
      success: true,
      driver: result,
      message: `Request submitted successfully. Your request will be reviewed by the supervisor at ${assignedStation.name}.`
    };
  }

  /**
   * Get pending driver requests for a supervisor's station
   */
  async getPendingRequests(supervisorStationId: string, page: number = 1, limit: number = 10) {
    const offset = (page - 1) * limit;

    const [requests, total] = await Promise.all([
      prisma.driver.findMany({
        where: {
          assignedStationId: supervisorStationId,
          accountStatus: 'PENDING'
        },
        include: {
          originGovernorate: true,
          originDelegation: true,
          assignedStation: true,
          vehicle: true
        },
        orderBy: { createdAt: 'desc' },
        skip: offset,
        take: limit
      }),
      prisma.driver.count({
        where: {
          assignedStationId: supervisorStationId,
          accountStatus: 'PENDING'
        }
      })
    ]);

    return {
      requests,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      }
    };
  }

  /**
   * Get all pending requests for admin
   */
  async getAllPendingRequests(page: number = 1, limit: number = 10) {
    const offset = (page - 1) * limit;

    const [requests, total] = await Promise.all([
      prisma.driver.findMany({
        where: {
          accountStatus: 'PENDING'
        },
        include: {
          originGovernorate: true,
          originDelegation: true,
          assignedStation: {
            include: {
              governorate: true,
              delegation: true
            }
          },
          vehicle: true
        },
        orderBy: { createdAt: 'desc' },
        skip: offset,
        take: limit
      }),
      prisma.driver.count({
        where: {
          accountStatus: 'PENDING'
        }
      })
    ]);

    return {
      requests,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      }
    };
  }

  /**
   * Approve or deny a driver request
   */
  async processDriverRequest(driverId: string, approvalData: VehicleApprovalData) {
    const driver = await prisma.driver.findUnique({
      where: { id: driverId },
      include: {
        vehicle: true,
        assignedStation: true
      }
    });

    if (!driver) {
      throw new Error('Driver request not found');
    }

    if (driver.accountStatus !== 'PENDING') {
      throw new Error('Request has already been processed');
    }

    const updateData: any = {
      accountStatus: approvalData.approved ? 'APPROVED' : 'REJECTED',
      approvedBy: approvalData.supervisorId,
      approvedAt: new Date()
    };

    if (approvalData.approved) {
      updateData.isActive = true;
    } else {
      updateData.rejectionReason = approvalData.rejectionReason;
    }

    // Update driver
    const updatedDriver = await prisma.driver.update({
      where: { id: driverId },
      data: updateData,
      include: {
        originGovernorate: true,
        originDelegation: true,
        assignedStation: true,
        vehicle: true,
        approvedByStaff: true
      }
    });

    // Update vehicle status if approved
    if (approvalData.approved && driver.vehicle) {
      await prisma.vehicle.update({
        where: { id: driver.vehicle.id },
        data: {
          isActive: true,
          isAvailable: true
        }
      });

      // Broadcast vehicle update to authorized stations
      const wsServer = CentralWebSocketServer.getInstance();
      if (wsServer) {
        await wsServer.broadcastVehicleUpdate(driver.vehicle.id, 'update');
      }
    }

    return {
      success: true,
      driver: updatedDriver,
      message: approvalData.approved
        ? 'Driver request approved successfully'
        : 'Driver request rejected'
    };
  }

  /**
   * Get vehicles with pagination and search
   */
  async getVehicles(
    filters: {
      search?: string;
      stationId?: string;
      isActive?: boolean;
      isAvailable?: boolean;
    } = {},
    page: number = 1,
    limit: number = 10
  ) {
    const offset = (page - 1) * limit;

    const where: any = {};

    if (filters.search) {
      where.OR = [
        { licensePlate: { contains: filters.search, mode: 'insensitive' } },
        { model: { contains: filters.search, mode: 'insensitive' } },
        {
          driver: {
            OR: [
              { firstName: { contains: filters.search, mode: 'insensitive' } },
              { lastName: { contains: filters.search, mode: 'insensitive' } },
              { cin: { contains: filters.search, mode: 'insensitive' } }
            ]
          }
        }
      ];
    }

    if (filters.stationId) {
      where.driver = {
        assignedStationId: filters.stationId
      };
    }

    if (filters.isActive !== undefined) {
      where.isActive = filters.isActive;
    }

    if (filters.isAvailable !== undefined) {
      where.isAvailable = filters.isAvailable;
    }

    const [vehicles, total] = await Promise.all([
      prisma.vehicle.findMany({
        where,
        include: {
          driver: {
            include: {
              originGovernorate: true,
              originDelegation: true,
              assignedStation: true
            }
          },
          authorizedStations: {
            include: {
              station: {
                include: {
                  governorate: true,
                  delegation: true
                }
              }
            }
          }
        },
        orderBy: { createdAt: 'desc' },
        skip: offset,
        take: limit
      }),
      prisma.vehicle.count({ where })
    ]);

    return {
      vehicles,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      }
    };
  }

  /**
   * Get single driver by ID
   */
  async getDriverById(driverId: string) {
    const driver = await prisma.driver.findUnique({
      where: { id: driverId },
      include: {
        originGovernorate: true,
        originDelegation: true,
        assignedStation: true,
        vehicle: true
      }
    });

    return driver;
  }

  /**
   * Get single vehicle by ID
   */
  async getVehicleById(vehicleId: string) {
    const vehicle = await prisma.vehicle.findUnique({
      where: { id: vehicleId },
      include: {
        driver: {
          include: {
            originGovernorate: true,
            originDelegation: true,
            assignedStation: {
              include: {
                governorate: true,
                delegation: true
              }
            }
          }
        },
        authorizedStations: {
          include: {
            station: {
              include: {
                governorate: true,
                delegation: true
              }
            }
          }
        },
        queueEntries: {
          include: {
            station: true,
            destination: true
          },
          orderBy: { createdAt: 'desc' },
          take: 5
        }
      }
    });

    if (!vehicle) {
      throw new Error('Vehicle not found');
    }

    return vehicle;
  }

  /**
   * Update vehicle information
   */
  async updateVehicle(vehicleId: string, updateData: {
    capacity?: number;
    model?: string;
    year?: number;
    color?: string;
    isActive?: boolean;
    isAvailable?: boolean;
    authorizedStationIds?: string[];
  }) {
    const vehicle = await prisma.vehicle.findUnique({
      where: { id: vehicleId }
    });

    if (!vehicle) {
      throw new Error('Vehicle not found');
    }

    // If updating authorized stations, validate them
    if (updateData.authorizedStationIds) {
      if (updateData.authorizedStationIds.length < 2) {
        throw new Error('Vehicle must be authorized for at least 2 stations to operate between them');
      }

      const authorizedStations = await prisma.station.findMany({
        where: {
          id: { in: updateData.authorizedStationIds },
          isActive: true
        }
      });

      if (authorizedStations.length !== updateData.authorizedStationIds.length) {
        throw new Error('One or more authorized stations are invalid or inactive');
      }
    }

    const updatedVehicle = await prisma.$transaction(async (tx) => {
      // Update basic vehicle info
      const { authorizedStationIds, ...vehicleData } = updateData;
      await tx.vehicle.update({
        where: { id: vehicleId },
        data: vehicleData
      });

      // Update authorized stations if provided
      if (authorizedStationIds) {
        // Remove existing authorized stations
        await tx.vehicleAuthorizedStation.deleteMany({
          where: { vehicleId }
        });

        // Add new authorized stations
        const authorizedStationData = authorizedStationIds.map(stationId => ({
          vehicleId,
          stationId
        }));

        await tx.vehicleAuthorizedStation.createMany({
          data: authorizedStationData
        });
      }

      // Return updated vehicle with all relations
      return await tx.vehicle.findUnique({
        where: { id: vehicleId },
        include: {
          driver: {
            include: {
              originGovernorate: true,
              originDelegation: true,
              assignedStation: true
            }
          },
          authorizedStations: {
            include: {
              station: {
                include: {
                  governorate: true,
                  delegation: true
                }
              }
            }
          }
        }
      });
    });

    // Broadcast vehicle update to authorized stations
    if (updatedVehicle?.isActive) {
      const wsServer = CentralWebSocketServer.getInstance();
      if (wsServer) {
        await wsServer.broadcastVehicleUpdate(vehicleId, 'update');
      }
    }

    return updatedVehicle;
  }

  /**
   * Update only authorized stations for a vehicle
   */
  async updateVehicleAuthorizedStations(vehicleId: string, authorizedStationIds: string[]) {
    if (authorizedStationIds.length < 2) {
      throw new Error('Vehicle must be authorized for at least 2 stations to operate between them');
    }

    const vehicle = await prisma.vehicle.findUnique({
      where: { id: vehicleId }
    });

    if (!vehicle) {
      throw new Error('Vehicle not found');
    }

    // Validate stations
    const authorizedStations = await prisma.station.findMany({
      where: {
        id: { in: authorizedStationIds },
        isActive: true
      }
    });

    if (authorizedStations.length !== authorizedStationIds.length) {
      throw new Error('One or more authorized stations are invalid or inactive');
    }

    await prisma.$transaction(async (tx) => {
      // Remove existing authorized stations
      await tx.vehicleAuthorizedStation.deleteMany({
        where: { vehicleId }
      });

      // Add new authorized stations
      const authorizedStationData = authorizedStationIds.map(stationId => ({
        vehicleId,
        stationId
      }));

      await tx.vehicleAuthorizedStation.createMany({
        data: authorizedStationData
      });
    });

    const updatedVehicle = await this.getVehicleById(vehicleId);

    // Broadcast vehicle update to authorized stations (including newly authorized ones)
    const wsServer = CentralWebSocketServer.getInstance();
    if (wsServer && updatedVehicle.isActive) {
      await wsServer.broadcastVehicleUpdate(vehicleId, 'update');
    }

    return updatedVehicle;
  }

  /**
   * Check if vehicle is authorized to operate between two stations
   */
  async isVehicleAuthorizedForRoute(vehicleId: string, fromStationId: string, toStationId: string): Promise<boolean> {
    const authorizedStations = await prisma.vehicleAuthorizedStation.findMany({
      where: {
        vehicleId,
        stationId: { in: [fromStationId, toStationId] }
      }
    });

    // Vehicle must be authorized for both stations
    return authorizedStations.length === 2;
  }

  /**
   * Get all authorized stations for a vehicle
   */
  async getVehicleAuthorizedStations(vehicleId: string) {
    const vehicle = await prisma.vehicle.findUnique({
      where: { id: vehicleId },
      include: {
        authorizedStations: {
          include: {
            station: {
              include: {
                governorate: true,
                delegation: true
              }
            }
          }
        }
      }
    });

    if (!vehicle) {
      throw new Error('Vehicle not found');
    }

    return vehicle.authorizedStations.map(auth => auth.station);
  }

  /**
   * Delete vehicle (and associated driver if exists)
   */
  async deleteVehicle(vehicleId: string) {
    const vehicle = await prisma.vehicle.findUnique({
      where: { id: vehicleId },
      include: { driver: true }
    });

    if (!vehicle) {
      throw new Error('Vehicle not found');
    }

    // Check if vehicle is in any active queues
    const activeQueues = await prisma.vehicleQueue.count({
      where: {
        vehicleId: vehicleId,
        status: { in: ['WAITING', 'LOADING'] }
      }
    });

    if (activeQueues > 0) {
      throw new Error('Cannot delete vehicle that is in active queues');
    }

    // Broadcast vehicle deletion to authorized stations (before deletion)
    const wsServer = CentralWebSocketServer.getInstance();
    if (wsServer) {
      await wsServer.broadcastVehicleUpdate(vehicleId, 'delete');
    }

    // Delete driver first if exists (due to foreign key constraint)
    if (vehicle.driver) {
      await prisma.driver.delete({
        where: { id: vehicle.driver.id }
      });
    }

    // Delete vehicle
    await prisma.vehicle.delete({
      where: { id: vehicleId }
    });

    return { success: true, message: 'Vehicle deleted successfully' };
  }

  /**
   * Ban a vehicle (set isBanned=true, isActive=false)
   */
  async banVehicle(vehicleId: string, _staffId: string): Promise<{ success: boolean; error?: string }> {
    try {
      await prisma.vehicle.update({
        where: { id: vehicleId },
        data: { isBanned: true, isActive: false, updatedAt: new Date() }
      });
      // Optionally: log the ban action, notify, etc.
      return { success: true };
    } catch (error: any) {
      return { success: false, error: error.message || 'Failed to ban vehicle' };
    }
  }
}

export const vehicleService = new VehicleService(); 