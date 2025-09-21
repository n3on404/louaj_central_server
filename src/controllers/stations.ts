import { Request, Response } from 'express';
import bcrypt from 'bcrypt';
import { prisma } from '../config/database';
import { StaffRole } from '@prisma/client';
import axios from 'axios';

// =============== ADMIN FUNCTIONS ===============

/**
 * Create a new station (ADMIN only)
 * POST /api/v1/stations
 */
export const createStation = async (req: Request, res: Response): Promise<void> => {
  try {
    // Allow SUPERVISOR or ADMIN
    if (!req.staff || (req.staff.role !== 'ADMIN' && req.staff.role !== 'SUPERVISOR')) {
      res.status(403).json({
        success: false,
        message: 'Only supervisors or admins can create stations',
        code: 'FORBIDDEN'
      });
      return;
    }
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

/**
 * Create station and supervisor from approved partnership request (ADMIN only)
 * POST /api/v1/stations/partnership-request
 */
export const createFromPartnershipRequest = async (req: Request, res: Response): Promise<void> => {
  try {
    const {
      requestNumber,
      firstName,
      lastName,
      phoneNumber,
      cin,
      governorate,
      delegation,
      latitude,
      longitude
    } = req.body;

    // Validate required fields
    if (!requestNumber || !firstName || !lastName || !phoneNumber || !cin || !governorate || !delegation) {
      res.status(400).json({
        success: false,
        message: 'Missing required fields',
        code: 'MISSING_REQUIRED_FIELDS'
      });
      return;
    }

    // Check if CIN already exists in staff table
    const existingStaff = await prisma.staff.findUnique({
      where: { cin }
    });

    if (existingStaff) {
      res.status(400).json({
        success: false,
        message: 'CIN already exists in staff database',
        code: 'CIN_ALREADY_EXISTS'
      });
      return;
    }

    // Check if station name already exists
    const existingStation = await prisma.station.findFirst({
      where: { name: { equals: `${delegation} Station`, mode: 'insensitive' } }
    });

    if (existingStation) {
      res.status(400).json({
        success: false,
        message: `Station with name "${delegation} Station" already exists`,
        code: 'STATION_NAME_EXISTS'
      });
      return;
    }

    // Use Tunisian Municipality API to get Arabic names and coordinates (only as fallback)
    let finalLatitude = latitude;
    let finalLongitude = longitude;
    let governorateNameAr = null;
    let delegationNameAr = null;

    try {
      const municipalityResponse = await axios.get(`https://tn-municipality-api.vercel.app/api/municipalities?name=${encodeURIComponent(governorate)}&delegation=${encodeURIComponent(delegation)}`);
      
      if (municipalityResponse.data && Array.isArray(municipalityResponse.data) && municipalityResponse.data.length > 0) {
        const governorateData = municipalityResponse.data[0] as any;
        
        // Get governorate Arabic name
        if (governorateData.NameAr) {
          governorateNameAr = governorateData.NameAr;
        }
        
        // Find delegation and get its data
        const delegationData = governorateData.Delegations?.find((d: any) => 
          d.Name.toLowerCase().includes(delegation.toLowerCase()) ||
          d.Value.toLowerCase().includes(delegation.toLowerCase())
        );
        
        if (delegationData) {
          // Get delegation Arabic name
          if (delegationData.NameAr) {
            delegationNameAr = delegationData.NameAr;
          }
          
          // ONLY use coordinates from API if user didn't provide any coordinates
          if (!latitude && !longitude) {
            finalLatitude = delegationData.Latitude;
            finalLongitude = delegationData.Longitude;
            console.log(`📍 Using coordinates from municipality API: ${finalLatitude}, ${finalLongitude}`);
          } else {
            console.log(`📍 Using user-provided coordinates: ${finalLatitude}, ${finalLongitude}`);
          }
        }
      }
    } catch (apiError) {
      console.warn('⚠️ Could not fetch data from municipality API, using default values');
      // Only set default coordinates if user didn't provide any
      if (!latitude && !longitude) {
        finalLatitude = 36.8065; // Tunisia center
        finalLongitude = 10.1815;
        console.log(`📍 Using default Tunisia center coordinates: ${finalLatitude}, ${finalLongitude}`);
      }
    }

    // Start transaction to create everything together
    const result = await prisma.$transaction(async (tx) => {
      // 1. Find or create governorate
      let governorateRecord = await tx.governorate.findFirst({
        where: { name: { equals: governorate, mode: 'insensitive' } }
      });

      if (!governorateRecord) {
        governorateRecord = await tx.governorate.create({
          data: {
            name: governorate,
            nameAr: governorateNameAr
          }
        });
        console.log(`🏛️ Created new governorate: ${governorate}${governorateNameAr ? ` (${governorateNameAr})` : ''}`);
      } else if (governorateNameAr && !governorateRecord.nameAr) {
        // Update existing governorate with Arabic name if we have it
        governorateRecord = await tx.governorate.update({
          where: { id: governorateRecord.id },
          data: { nameAr: governorateNameAr }
        });
        console.log(`🏛️ Updated governorate with Arabic name: ${governorate} (${governorateNameAr})`);
      }

      // 2. Find or create delegation
      let delegationRecord = await tx.delegation.findFirst({
        where: { 
          name: { equals: delegation, mode: 'insensitive' },
          governorateId: governorateRecord.id
        }
      });

      if (!delegationRecord) {
        delegationRecord = await tx.delegation.create({
          data: {
            name: delegation,
            nameAr: delegationNameAr,
            governorateId: governorateRecord.id
          }
        });
        console.log(`🏘️ Created new delegation: ${delegation}${delegationNameAr ? ` (${delegationNameAr})` : ''} in ${governorate}`);
      } else if (delegationNameAr && !delegationRecord.nameAr) {
        // Update existing delegation with Arabic name if we have it
        delegationRecord = await tx.delegation.update({
          where: { id: delegationRecord.id },
          data: { nameAr: delegationNameAr }
        });
        console.log(`🏘️ Updated delegation with Arabic name: ${delegation} (${delegationNameAr})`);
      }

      // 3. Create supervisor staff member
      const hashedPassword = await bcrypt.hash(cin, 12); // CIN as default password
      const supervisor = await tx.staff.create({
        data: {
          cin,
          phoneNumber,
          firstName,
          lastName,
          password: hashedPassword, // CIN as default password
          role: StaffRole.SUPERVISOR,
          isActive: true
        }
      });

      console.log(`👤 Created supervisor: ${firstName} ${lastName} (CIN: ${cin})`);

      // 4. Create station
      const station = await tx.station.create({
        data: {
          name: `${delegation} Station`,
          nameAr: delegationNameAr ? `${delegationNameAr} محطة` : null,
          governorateId: governorateRecord.id,
          delegationId: delegationRecord.id,
          address: `${delegation}, ${governorate}`,
          latitude: finalLatitude,
          longitude: finalLongitude,
          supervisorId: supervisor.id,
          isActive: true,
          isOnline: false
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

      console.log(`🏢 Created station: ${station.name} (${station.nameAr || 'No Arabic name'}) at ${delegation}, ${governorate}`);

      // 5. Update supervisor to set stationId (establish the station relationship)
      await tx.staff.update({
        where: { id: supervisor.id },
        data: { stationId: station.id }
      });

      console.log(`🔗 Linked supervisor ${supervisor.id} to station ${station.id}`);

      return {
        station,
        supervisor,
        governorate: governorateRecord,
        delegation: delegationRecord
      };
    });

    console.log(`✅ Successfully created station and supervisor from partnership request: ${requestNumber}`);

    res.status(201).json({
      success: true,
      message: 'Station and supervisor created successfully from partnership request',
      data: result
    });

  } catch (error: any) {
    console.error('❌ Error creating station from partnership request:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create station from partnership request',
      error: error.message
    });
  }
}; 