import { Request, Response } from 'express';
import bcrypt from 'bcrypt';
import { prisma } from '../lib/database';
import { instantSyncService } from '../services/instantSyncService';

export const getAllStaff = async (req: Request, res: Response): Promise<void> => {
  try {
    const { role, status } = req.query;
    
    // Filter by station - only show staff from the authenticated user's station
    const where: any = {
      stationId: req.staff?.station?.id
    };
    
    if (role) {
      where.role = role;
    }
    
    if (status) {
      where.isActive = status === 'active';
    }

    const staff = await prisma.staff.findMany({
      where,
      select: {
        id: true,
        cin: true,
        firstName: true,
        lastName: true,
        phoneNumber: true,
        role: true,
        isActive: true,
        stationId: true,
        createdAt: true,
        updatedAt: true,
        createdBy: true,
        _count: {
          select: {
            approvedDrivers: true
          }
        }
      },
      orderBy: {
        createdAt: 'desc'
      }
    });

    res.json({
      success: true,
      data: staff,
      count: staff.length
    });
  } catch (error) {
    console.error('Error fetching staff:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch staff members',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
};

export const getStaffById = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    
    const staff = await prisma.staff.findUnique({
      where: { id },
      select: {
        id: true,
        cin: true,
        firstName: true,
        lastName: true,
        phoneNumber: true,
        role: true,
        isActive: true,
        stationId: true,
        createdAt: true,
        updatedAt: true,
        createdBy: true,
        _count: {
          select: {
            approvedDrivers: true
          }
        }
      }
    });

    if (!staff) {
      res.status(404).json({
        success: false,
        message: 'Staff member not found'
      });
      return;
    }

    res.json({
      success: true,
      data: staff
    });
  } catch (error) {
    console.error('Error fetching staff member:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch staff member',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
};

export const createStaff = async (req: Request, res: Response): Promise<void> => {
  try {
    const { firstName, lastName, phoneNumber, cin } = req.body;
    
    // Validate required fields
    if (!firstName || !lastName || !phoneNumber || !cin) {
      res.status(400).json({
        success: false,
        message: 'First name, last name, phone number, and CIN are required'
      });
      return;
    }

    // Check if CIN already exists
    const existingStaff = await prisma.staff.findUnique({
      where: { cin }
    });

    if (existingStaff) {
      res.status(400).json({
        success: false,
        message: 'Staff member with this CIN already exists'
      });
      return;
    }

    // Get station ID from authenticated user
    const userStationId = req.staff?.station?.id;

    if (!userStationId) {
      res.status(400).json({
        success: false,
        message: 'Station not found for authenticated user'
      });
      return;
    }

    // Create new staff member as WORKER
    const hashedPassword = await bcrypt.hash(cin, 12); // CIN as default password
    const newStaff = await prisma.staff.create({
      data: {
        cin,
        firstName,
        lastName,
        phoneNumber,
        password: hashedPassword, // CIN as default password
        role: 'WORKER', // Always create as WORKER
        stationId: userStationId,
        isActive: true,
        createdBy: req.staff?.id || null
      },
      select: {
        id: true,
        cin: true,
        firstName: true,
        lastName: true,
        phoneNumber: true,
        role: true,
        isActive: true,
        stationId: true,
        createdAt: true
      }
    });

    // Trigger instant sync to local node
    try {
      await instantSyncService.syncStaff('CREATE', newStaff, userStationId);
      console.log(`📡 Staff creation sync triggered for station ${userStationId}: ${newStaff.firstName} ${newStaff.lastName}`);
    } catch (syncError) {
      console.error('❌ Error syncing staff creation:', syncError);
      // Don't fail the request if sync fails
    }

    res.status(201).json({
      success: true,
      message: 'Staff member created successfully',
      data: newStaff
    });
  } catch (error) {
    console.error('Error creating staff member:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create staff member',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
};

export const updateStaff = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { firstName, lastName, phoneNumber, role, isActive } = req.body;
    
    const staff = await prisma.staff.findUnique({
      where: { id }
    });

    if (!staff) {
      res.status(404).json({
        success: false,
        message: 'Staff member not found'
      });
      return;
    }

    // Check if staff belongs to the same station as the authenticated user
    if (staff.stationId !== req.staff?.station?.id) {
      res.status(403).json({
        success: false,
        message: 'You can only update staff members from your station'
      });
      return;
    }

    // Update staff member
    const updatedStaff = await prisma.staff.update({
      where: { id },
      data: {
        firstName,
        lastName,
        phoneNumber,
        role,
        isActive
      },
      select: {
        id: true,
        cin: true,
        firstName: true,
        lastName: true,
        phoneNumber: true,
        role: true,
        isActive: true,
        stationId: true,
        createdAt: true,
        updatedAt: true
      }
    });

    // Trigger instant sync to local node
    try {
      await instantSyncService.syncStaff('UPDATE', updatedStaff, updatedStaff.stationId || undefined);
      console.log(`📡 Staff update sync triggered for station ${updatedStaff.stationId}: ${updatedStaff.firstName} ${updatedStaff.lastName}`);
    } catch (syncError) {
      console.error('❌ Error syncing staff update:', syncError);
      // Don't fail the request if sync fails
    }

    res.json({
      success: true,
      message: 'Staff member updated successfully',
      data: updatedStaff
    });
  } catch (error) {
    console.error('Error updating staff member:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update staff member',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
};

export const toggleStaffStatus = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    
    const staff = await prisma.staff.findUnique({
      where: { id }
    });

    if (!staff) {
      res.status(404).json({
        success: false,
        message: 'Staff member not found'
      });
      return;
    }

    // Check if staff belongs to the same station as the authenticated user
    if (staff.stationId !== req.staff?.station?.id) {
      res.status(403).json({
        success: false,
        message: 'You can only toggle status of staff members from your station'
      });
      return;
    }

    // Prevent deactivating own account
    if (staff.id === req.staff?.id) {
      res.status(400).json({
        success: false,
        message: 'Cannot deactivate your own account'
      });
      return;
    }

    const updatedStaff = await prisma.staff.update({
      where: { id },
      data: {
        isActive: !staff.isActive
      },
      select: {
        id: true,
        cin: true,
        firstName: true,
        lastName: true,
        phoneNumber: true,
        role: true,
        isActive: true,
        stationId: true,
        createdAt: true,
        updatedAt: true
      }
    });

    res.json({
      success: true,
      message: `Staff member ${updatedStaff.isActive ? 'activated' : 'deactivated'} successfully`,
      data: updatedStaff
    });
  } catch (error) {
    console.error('Error toggling staff status:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to toggle staff status',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
};

export const deleteStaff = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    
    const staff = await prisma.staff.findUnique({
      where: { id }
    });

    if (!staff) {
      res.status(404).json({
        success: false,
        message: 'Staff member not found'
      });
      return;
    }

    // Check if staff belongs to the same station as the authenticated user
    if (staff.stationId !== req.staff?.station?.id) {
      res.status(403).json({
        success: false,
        message: 'You can only delete staff members from your station'
      });
      return;
    }

    // Prevent deleting own account
    if (staff.id === req.staff?.id) {
      res.status(400).json({
        success: false,
        message: 'Cannot delete your own account'
      });
      return;
    }

    // Check if staff has any approved drivers
    const driverCount = await prisma.driver.count({
      where: {
        approvedBy: id
      }
    });

    if (driverCount > 0) {
      res.status(400).json({
        success: false,
        message: `Cannot delete staff member with ${driverCount} approved driver(s). Please reassign drivers first.`
      });
      return;
    }

    await prisma.staff.delete({
      where: { id }
    });

    res.json({
      success: true,
      message: 'Staff member deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting staff member:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete staff member',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}; 