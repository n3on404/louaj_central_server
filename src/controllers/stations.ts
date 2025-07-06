import { Request, Response } from 'express';
import { PrismaClient, StaffRole } from '@prisma/client';

const prisma = new PrismaClient();

// =============== ADMIN FUNCTIONS ===============

/**
 * Create a new station (ADMIN only)
 * POST /api/v1/stations
 */
export const createStation = async (req: Request, res: Response): Promise<void> => {
  try {
    const { 
      name, 
      nameAr, 
      governorateId, 
      delegationId, 
      address, 
      latitude, 
      longitude, 
      localServerIp 
    } = req.body;

    // Validate required fields
    if (!name || !governorateId || !delegationId) {
      res.status(400).json({
        success: false,
        message: 'Name, governorate, and delegation are required',
        code: 'MISSING_REQUIRED_FIELDS'
      });
      return;
    }

    // Check if governorate and delegation exist
    const governorate = await prisma.governorate.findUnique({
      where: { id: governorateId }
    });

    if (!governorate) {
      res.status(404).json({
        success: false,
        message: 'Governorate not found',
        code: 'GOVERNORATE_NOT_FOUND'
      });
      return;
    }

    const delegation = await prisma.delegation.findUnique({
      where: { id: delegationId }
    });

    if (!delegation) {
      res.status(404).json({
        success: false,
        message: 'Delegation not found',
        code: 'DELEGATION_NOT_FOUND'
      });
      return;
    }

    // Create the station
    const station = await prisma.station.create({
      data: {
        name,
        nameAr,
        governorateId,
        delegationId,
        address,
        latitude,
        longitude,
        localServerIp
      },
      include: {
        governorate: true,
        delegation: true,
        supervisor: {
          select: {
            id: true,
            cin: true,
            firstName: true,
            lastName: true,
            phoneNumber: true,
            role: true
          }
        }
      }
    });

    console.log(`🏢 Station created: ${station.name} by admin ${req.staff!.firstName} ${req.staff!.lastName}`);

    res.status(201).json({
      success: true,
      message: 'Station created successfully',
      data: station
    });
  } catch (error: any) {
    console.error('❌ Error creating station:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create station',
      error: error.message
    });
  }
};

/**
 * Get all stations (ADMIN only)
 * GET /api/v1/stations
 */
export const getAllStations = async (req: Request, res: Response): Promise<void> => {
  try {
    const { page = 1, limit = 10, search, governorateId } = req.query;

    const skip = (Number(page) - 1) * Number(limit);
    const take = Number(limit);

    // Build search filters
    const where: any = {};
    
    if (search) {
      where.OR = [
        { name: { contains: search as string, mode: 'insensitive' } },
        { nameAr: { contains: search as string, mode: 'insensitive' } },
        { address: { contains: search as string, mode: 'insensitive' } }
      ];
    }

    if (governorateId) {
      where.governorateId = governorateId as string;
    }

    const [stations, total] = await Promise.all([
      prisma.station.findMany({
        where,
        skip,
        take,
        include: {
          governorate: { select: { id: true, name: true } },
          delegation: { select: { id: true, name: true } },
          supervisor: {
            select: {
              id: true,
              cin: true,
              firstName: true,
              lastName: true,
              phoneNumber: true,
              role: true,
              isActive: true
            }
          },
          _count: {
            select: {
              staff: true,
              departureBookings: true,
              destinationBookings: true,
              queueEntries: true
            }
          }
        },
        orderBy: { createdAt: 'desc' }
      }),
      prisma.station.count({ where })
    ]);

    res.json({
      success: true,
      message: 'Stations retrieved successfully',
      data: {
        stations,
        pagination: {
          page: Number(page),
          limit: Number(limit),
          total,
          pages: Math.ceil(total / Number(limit))
        }
      }
    });
  } catch (error: any) {
    console.error('❌ Error getting stations:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve stations',
      error: error.message
    });
  }
};

/**
 * Get station by ID (ADMIN only)
 * GET /api/v1/stations/:id
 */
export const getStationById = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    const station = await prisma.station.findUnique({
      where: { id },
      include: {
        governorate: true,
        delegation: true,
        supervisor: {
          select: {
            id: true,
            cin: true,
            firstName: true,
            lastName: true,
            phoneNumber: true,
            role: true,
            isActive: true,
            createdAt: true
          }
        },
        staff: {
          select: {
            id: true,
            cin: true,
            firstName: true,
            lastName: true,
            phoneNumber: true,
            role: true,
            isActive: true
          }
        },
        _count: {
          select: {
            departureBookings: true,
            destinationBookings: true,
            queueEntries: true,
            syncLogs: true
          }
        }
      }
    });

    if (!station) {
      res.status(404).json({
        success: false,
        message: 'Station not found',
        code: 'STATION_NOT_FOUND'
      });
      return;
    }

    res.json({
      success: true,
      message: 'Station retrieved successfully',
      data: station
    });
  } catch (error: any) {
    console.error('❌ Error getting station:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve station',
      error: error.message
    });
  }
};

/**
 * Update station (ADMIN only)
 * PUT /api/v1/stations/:id
 */
export const updateStation = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { 
      name, 
      nameAr, 
      governorateId, 
      delegationId, 
      address, 
      latitude, 
      longitude, 
      localServerIp,
      isActive 
    } = req.body;

    // Check if station exists
    const existingStation = await prisma.station.findUnique({
      where: { id }
    });

    if (!existingStation) {
      res.status(404).json({
        success: false,
        message: 'Station not found',
        code: 'STATION_NOT_FOUND'
      });
      return;
    }

    // Update the station
    const updatedStation = await prisma.station.update({
      where: { id },
      data: {
        name,
        nameAr,
        governorateId,
        delegationId,
        address,
        latitude,
        longitude,
        localServerIp,
        isActive
      },
      include: {
        governorate: true,
        delegation: true,
        supervisor: {
          select: {
            id: true,
            cin: true,
            firstName: true,
            lastName: true,
            phoneNumber: true,
            role: true
          }
        }
      }
    });

    console.log(`🔄 Station updated: ${updatedStation.name} by admin ${req.staff!.firstName} ${req.staff!.lastName}`);

    res.json({
      success: true,
      message: 'Station updated successfully',
      data: updatedStation
    });
  } catch (error: any) {
    console.error('❌ Error updating station:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update station',
      error: error.message
    });
  }
};

/**
 * Delete station (ADMIN only)
 * DELETE /api/v1/stations/:id
 */
export const deleteStation = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    // Check if station exists
    const existingStation = await prisma.station.findUnique({
      where: { id },
      include: {
        supervisor: true,
        staff: true,
        _count: {
          select: {
            departureBookings: true,
            destinationBookings: true,
            queueEntries: true
          }
        }
      }
    });

    if (!existingStation) {
      res.status(404).json({
        success: false,
        message: 'Station not found',
        code: 'STATION_NOT_FOUND'
      });
      return;
    }

    // Check if station has active bookings or queue entries
    if (existingStation._count.departureBookings > 0 || existingStation._count.destinationBookings > 0 || existingStation._count.queueEntries > 0) {
      res.status(400).json({
        success: false,
        message: 'Cannot delete station with active bookings or queue entries',
        code: 'STATION_HAS_ACTIVE_DATA'
      });
      return;
    }

    // Delete the station (this will cascade delete staff relationships)
    await prisma.station.delete({
      where: { id }
    });

    console.log(`🗑️ Station deleted: ${existingStation.name} by admin ${req.staff!.firstName} ${req.staff!.lastName}`);

    res.json({
      success: true,
      message: 'Station deleted successfully'
    });
  } catch (error: any) {
    console.error('❌ Error deleting station:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete station',
      error: error.message
    });
  }
};

/**
 * Assign supervisor to station (ADMIN only)
 * POST /api/v1/stations/:id/supervisor
 */
export const assignSupervisor = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { supervisorId } = req.body;

    if (!supervisorId) {
      res.status(400).json({
        success: false,
        message: 'Supervisor ID is required',
        code: 'SUPERVISOR_ID_REQUIRED'
      });
      return;
    }

    // Check if station exists
    const station = await prisma.station.findUnique({
      where: { id },
      include: { supervisor: true }
    });

    if (!station) {
      res.status(404).json({
        success: false,
        message: 'Station not found',
        code: 'STATION_NOT_FOUND'
      });
      return;
    }

    // Check if station already has a supervisor
    if (station.supervisor) {
      res.status(400).json({
        success: false,
        message: 'Station already has a supervisor',
        code: 'STATION_HAS_SUPERVISOR'
      });
      return;
    }

    // Check if supervisor exists and is a supervisor
    const supervisor = await prisma.staff.findUnique({
      where: { id: supervisorId },
      include: { supervisingStation: true }
    });

    if (!supervisor) {
      res.status(404).json({
        success: false,
        message: 'Supervisor not found',
        code: 'SUPERVISOR_NOT_FOUND'
      });
      return;
    }

    if (supervisor.role !== StaffRole.SUPERVISOR) {
      res.status(400).json({
        success: false,
        message: 'Staff member is not a supervisor',
        code: 'NOT_SUPERVISOR'
      });
      return;
    }

    // Check if supervisor is already managing another station
    if (supervisor.supervisingStation) {
      res.status(400).json({
        success: false,
        message: 'Supervisor is already managing another station',
        code: 'SUPERVISOR_ALREADY_ASSIGNED'
      });
      return;
    }

    // Assign supervisor to station
    const updatedStation = await prisma.station.update({
      where: { id },
      data: { supervisorId },
      include: {
        governorate: true,
        delegation: true,
        supervisor: {
          select: {
            id: true,
            cin: true,
            firstName: true,
            lastName: true,
            phoneNumber: true,
            role: true
          }
        }
      }
    });

    console.log(`👥 Supervisor assigned: ${supervisor.firstName} ${supervisor.lastName} to station ${station.name}`);

    res.json({
      success: true,
      message: 'Supervisor assigned successfully',
      data: updatedStation
    });
  } catch (error: any) {
    console.error('❌ Error assigning supervisor:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to assign supervisor',
      error: error.message
    });
  }
};

/**
 * Remove supervisor from station (ADMIN only)
 * DELETE /api/v1/stations/:id/supervisor
 */
export const removeSupervisor = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    // Check if station exists
    const station = await prisma.station.findUnique({
      where: { id },
      include: { supervisor: true }
    });

    if (!station) {
      res.status(404).json({
        success: false,
        message: 'Station not found',
        code: 'STATION_NOT_FOUND'
      });
      return;
    }

    if (!station.supervisor) {
      res.status(400).json({
        success: false,
        message: 'Station has no supervisor to remove',
        code: 'NO_SUPERVISOR'
      });
      return;
    }

    // Remove supervisor from station
    const updatedStation = await prisma.station.update({
      where: { id },
      data: { supervisorId: null },
      include: {
        governorate: true,
        delegation: true,
        supervisor: true
      }
    });

    console.log(`👥 Supervisor removed from station: ${station.name}`);

    res.json({
      success: true,
      message: 'Supervisor removed successfully',
      data: updatedStation
    });
  } catch (error: any) {
    console.error('❌ Error removing supervisor:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to remove supervisor',
      error: error.message
    });
  }
};

// =============== SUPERVISOR FUNCTIONS ===============

/**
 * Get my station (SUPERVISOR only)
 * GET /api/v1/stations/my/station
 */
export const getMyStation = async (req: Request, res: Response): Promise<void> => {
  try {
    const staffId = req.staff!.id;

    // Find the station this supervisor manages
    const station = await prisma.station.findFirst({
      where: { supervisorId: staffId },
      include: {
        governorate: true,
        delegation: true,
        staff: {
          select: {
            id: true,
            cin: true,
            firstName: true,
            lastName: true,
            phoneNumber: true,
            role: true,
            isActive: true
          }
        },
        _count: {
          select: {
            departureBookings: true,
            destinationBookings: true,
            queueEntries: true
          }
        }
      }
    });

    if (!station) {
      res.status(404).json({
        success: false,
        message: 'You are not assigned to any station',
        code: 'NO_STATION_ASSIGNED'
      });
      return;
    }

    res.json({
      success: true,
      message: 'Your station retrieved successfully',
      data: station
    });
  } catch (error: any) {
    console.error('❌ Error getting supervisor station:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve your station',
      error: error.message
    });
  }
};

/**
 * Update my station info (SUPERVISOR only - limited fields)
 * PUT /api/v1/stations/my/station
 */
export const updateMyStation = async (req: Request, res: Response): Promise<void> => {
  try {
    const staffId = req.staff!.id;
    const { localServerIp, isOnline } = req.body;

    // Find the station this supervisor manages
    const station = await prisma.station.findFirst({
      where: { supervisorId: staffId }
    });

    if (!station) {
      res.status(404).json({
        success: false,
        message: 'You are not assigned to any station',
        code: 'NO_STATION_ASSIGNED'
      });
      return;
    }

    // Update allowed fields only
    const updatedStation = await prisma.station.update({
      where: { id: station.id },
      data: {
        localServerIp,
        isOnline,
        lastHeartbeat: new Date()
      },
      include: {
        governorate: true,
        delegation: true
      }
    });

    console.log(`🔄 Station updated by supervisor: ${station.name} by ${req.staff!.firstName} ${req.staff!.lastName}`);

    res.json({
      success: true,
      message: 'Station updated successfully',
      data: updatedStation
    });
  } catch (error: any) {
    console.error('❌ Error updating supervisor station:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update station',
      error: error.message
    });
  }
}; 