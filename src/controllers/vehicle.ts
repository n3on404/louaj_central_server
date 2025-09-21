import { Request, Response } from 'express';
import { vehicleService } from '../services/vehicle';
import { prisma } from '../config/database';
import { instantSyncService } from '../services/instantSyncService';

/**
 * Controller for vehicle management and driver requests
 */
export class VehicleController {
  
  /**
   * POST /api/v1/vehicles/request
   * Submit a driver account request with vehicle info
   * Public endpoint - no auth required
   */
  async submitDriverRequest(req: Request, res: Response): Promise<void> {
    try {
      const requestData = req.body;

      // Validate required fields
      const requiredFields = [
        'cin', 'licensePlate', 'authorizedStationIds'
      ];

      for (const field of requiredFields) {
        if (!requestData[field]) {
          res.status(400).json({
            success: false,
            message: `${field} is required`,
            code: 'MISSING_FIELD'
          });
          return;
        }
      }

      // Validate authorizedStationIds is an array with at least 2 stations
      if (!Array.isArray(requestData.authorizedStationIds) || requestData.authorizedStationIds.length < 2) {
        res.status(400).json({
          success: false,
          message: 'Vehicle must be authorized for at least 2 stations to operate between them',
          code: 'INVALID_AUTHORIZED_STATIONS'
        });
        return;
      }

      const result = await vehicleService.submitDriverRequest(requestData);

      res.status(201).json({
        success: true,
        data: result.driver,
        message: result.message
      });
    } catch (error: any) {
      console.error('❌ Submit driver request error:', error);
      
      if (error.message.includes('already exists')) {
        res.status(409).json({
          success: false,
          message: error.message,
          code: 'ALREADY_EXISTS'
        });
        return;
      }

      res.status(500).json({
        success: false,
        message: 'Failed to submit driver request',
        code: 'SUBMIT_REQUEST_ERROR'
      });
    }
  }

  /**
   * GET /api/v1/vehicles/pending
   * Get pending driver requests for supervisor's station or all for admin
   * Requires: SUPERVISOR or ADMIN role
   */
  async getPendingRequests(req: Request, res: Response): Promise<void> {
    try {
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 10;
      const { role, station } = req.staff!;

      let result;

      if (role === 'ADMIN') {
        // Admin can see all pending requests
        result = await vehicleService.getAllPendingRequests(page, limit);
      } else if (role === 'SUPERVISOR' && station?.id) {
        // Supervisor can only see requests for their station
        result = await vehicleService.getPendingRequests(station.id, page, limit);
      } else {
        res.status(403).json({
          success: false,
          message: 'Insufficient permissions to view pending requests',
          code: 'INSUFFICIENT_PERMISSIONS'
        });
        return;
      }

      res.json({
        success: true,
        data: result.requests,
        pagination: result.pagination
      });
    } catch (error: any) {
      console.error('❌ Get pending requests error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to get pending requests',
        code: 'GET_PENDING_ERROR'
      });
    }
  }

  /**
   * POST /api/v1/vehicles/:id/approve
   * Approve a driver request
   * Requires: SUPERVISOR or ADMIN role
   */
  async approveDriverRequest(req: Request, res: Response): Promise<void> {
    try {
      const { id: driverId } = req.params;
      const { id: supervisorId, role, station } = req.staff!;

      // Verify supervisor has permission to approve this request
      if (role === 'SUPERVISOR') {
        // Check if the driver request is assigned to supervisor's station
        const driver = await vehicleService.getDriverById(driverId);
        if (!driver || driver.assignedStationId !== station?.id) {
          res.status(403).json({
            success: false,
            message: 'You can only approve requests assigned to your station',
            code: 'STATION_MISMATCH'
          });
          return;
        }
      }

      const result = await vehicleService.processDriverRequest(driverId, {
        supervisorId,
        approved: true
      });

      // Trigger instant sync to local nodes for the approved vehicle
      try {
        if (result.driver?.vehicle) {
          // Get authorized stations for this vehicle
          const authorizedStations = await prisma.vehicleAuthorizedStation.findMany({
            where: { vehicleId: result.driver.vehicle.id },
            select: { stationId: true }
          });
          
          const authorizedStationIds = authorizedStations.map(auth => auth.stationId);
          
          await instantSyncService.syncVehicle('CREATE', result.driver.vehicle, authorizedStationIds);
          console.log(`📡 Vehicle approval sync triggered for stations: ${authorizedStationIds.join(', ')}`);
        }
      } catch (syncError) {
        console.error('❌ Error syncing vehicle approval:', syncError);
        // Don't fail the request if sync fails
      }

      res.json({
        success: true,
        data: result.driver,
        message: result.message
      });
    } catch (error: any) {
      console.error('❌ Approve driver request error:', error);
      
      if (error.message.includes('not found')) {
        res.status(404).json({
          success: false,
          message: error.message,
          code: 'DRIVER_NOT_FOUND'
        });
        return;
      }

      if (error.message.includes('already been processed')) {
        res.status(400).json({
          success: false,
          message: error.message,
          code: 'ALREADY_PROCESSED'
        });
        return;
      }

      res.status(500).json({
        success: false,
        message: 'Failed to approve driver request',
        code: 'APPROVE_ERROR'
      });
    }
  }

  /**
   * POST /api/v1/vehicles/:id/deny
   * Deny a driver request
   * Requires: SUPERVISOR or ADMIN role
   */
  async denyDriverRequest(req: Request, res: Response): Promise<void> {
    try {
      const { id: driverId } = req.params;
      const { reason } = req.body;
      const { id: supervisorId, role, station } = req.staff!;

      if (!reason) {
        res.status(400).json({
          success: false,
          message: 'Rejection reason is required',
          code: 'REASON_REQUIRED'
        });
        return;
      }

      // Verify supervisor has permission to deny this request
      if (role === 'SUPERVISOR') {
        const driver = await vehicleService.getDriverById(driverId);
        if (!driver || driver.assignedStationId !== station?.id) {
          res.status(403).json({
            success: false,
            message: 'You can only deny requests assigned to your station',
            code: 'STATION_MISMATCH'
          });
          return;
        }
      }

      const result = await vehicleService.processDriverRequest(driverId, {
        supervisorId,
        approved: false,
        rejectionReason: reason
      });

      res.json({
        success: true,
        data: result.driver,
        message: result.message
      });
    } catch (error: any) {
      console.error('❌ Deny driver request error:', error);
      
      if (error.message.includes('not found')) {
        res.status(404).json({
          success: false,
          message: error.message,
          code: 'DRIVER_NOT_FOUND'
        });
        return;
      }

      res.status(500).json({
        success: false,
        message: 'Failed to deny driver request',
        code: 'DENY_ERROR'
      });
    }
  }

  /**
   * GET /api/v1/vehicles
   * Get vehicles with pagination and filtering
   * Requires: ADMIN or SUPERVISOR role
   */
  async getVehicles(req: Request, res: Response): Promise<void> {
    try {
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 10;
      const search = req.query.search as string;
      const isActive = req.query.isActive === 'true' ? true : req.query.isActive === 'false' ? false : undefined;
      const isAvailable = req.query.isAvailable === 'true' ? true : req.query.isAvailable === 'false' ? false : undefined;
      
      const { role, station } = req.staff!;

      const filters: any = {
        search,
        isActive,
        isAvailable
      };

      // Supervisor can only see vehicles from their station
      if (role === 'SUPERVISOR' && station?.id) {
        filters.stationId = station.id;
      }

      const result = await vehicleService.getVehicles(filters, page, limit);

      res.json({
        success: true,
        data: result.vehicles,
        pagination: result.pagination
      });
    } catch (error: any) {
      console.error('❌ Get vehicles error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to get vehicles',
        code: 'GET_VEHICLES_ERROR'
      });
    }
  }

  /**
   * GET /api/v1/vehicles/:id
   * Get single vehicle by ID
   * Requires: ADMIN or SUPERVISOR role
   */
  async getVehicleById(req: Request, res: Response): Promise<void> {
    try {
      const { id: vehicleId } = req.params;
      const { role, station } = req.staff!;

      const vehicle = await vehicleService.getVehicleById(vehicleId);

      // Supervisor can only see vehicles from their station
      if (role === 'SUPERVISOR' && vehicle.driver?.assignedStationId !== station?.id) {
        res.status(403).json({
          success: false,
          message: 'You can only view vehicles from your station',
          code: 'STATION_MISMATCH'
        });
        return;
      }

      res.json({
        success: true,
        data: vehicle
      });
    } catch (error: any) {
      console.error('❌ Get vehicle by ID error:', error);
      
      if (error.message.includes('not found')) {
        res.status(404).json({
          success: false,
          message: error.message,
          code: 'VEHICLE_NOT_FOUND'
        });
        return;
      }

      res.status(500).json({
        success: false,
        message: 'Failed to get vehicle',
        code: 'GET_VEHICLE_ERROR'
      });
    }
  }

  /**
   * PUT /api/v1/vehicles/:id
   * Update vehicle information
   * Requires: ADMIN role
   */
  async updateVehicle(req: Request, res: Response): Promise<void> {
    try {
      const { id: vehicleId } = req.params;
      const updateData = req.body;

      const vehicle = await vehicleService.updateVehicle(vehicleId, updateData);

      res.json({
        success: true,
        data: vehicle,
        message: 'Vehicle updated successfully'
      });
    } catch (error: any) {
      console.error('❌ Update vehicle error:', error);
      
      if (error.message.includes('not found')) {
        res.status(404).json({
          success: false,
          message: error.message,
          code: 'VEHICLE_NOT_FOUND'
        });
        return;
      }

      res.status(500).json({
        success: false,
        message: 'Failed to update vehicle',
        code: 'UPDATE_VEHICLE_ERROR'
      });
    }
  }

  /**
   * DELETE /api/v1/vehicles/:id
   * Delete vehicle and associated driver
   * Requires: ADMIN role
   */
  async deleteVehicle(req: Request, res: Response): Promise<void> {
    try {
      const { id: vehicleId } = req.params;

      const result = await vehicleService.deleteVehicle(vehicleId);

      res.json({
        success: true,
        message: result.message
      });
    } catch (error: any) {
      console.error('❌ Delete vehicle error:', error);
      
      if (error.message.includes('not found')) {
        res.status(404).json({
          success: false,
          message: error.message,
          code: 'VEHICLE_NOT_FOUND'
        });
        return;
      }

      if (error.message.includes('active queues')) {
        res.status(400).json({
          success: false,
          message: error.message,
          code: 'VEHICLE_IN_USE'
        });
        return;
      }

      res.status(500).json({
        success: false,
        message: 'Failed to delete vehicle',
        code: 'DELETE_VEHICLE_ERROR'
      });
    }
  }

  /**
   * GET /api/v1/vehicles/governorates
   * Get list of governorates for the driver request form
   * Public endpoint
   */
  async getGovernorates(_req: Request, res: Response): Promise<void> {
    try {
      const governorates = await prisma.governorate.findMany({
        select: {
          id: true,
          name: true,
          nameAr: true
        },
        orderBy: { name: 'asc' }
      });

      res.json({
        success: true,
        data: governorates
      });
    } catch (error: any) {
      console.error('❌ Get governorates error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to get governorates',
        code: 'GET_GOVERNORATES_ERROR'
      });
    }
  }

  /**
   * GET /api/v1/vehicles/delegations/:governorateId
   * Get delegations for a specific governorate
   * Public endpoint
   */
  async getDelegations(req: Request, res: Response): Promise<void> {
    try {
      const { governorateId } = req.params;
      const delegations = await prisma.delegation.findMany({
        where: { governorateId },
        select: {
          id: true,
          name: true,
          nameAr: true
        },
        orderBy: { name: 'asc' }
      });

      res.json({
        success: true,
        data: delegations
      });
    } catch (error: any) {
      console.error('❌ Get delegations error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to get delegations',
        code: 'GET_DELEGATIONS_ERROR'
      });
    }
  }

  /**
   * GET /api/v1/vehicles/stations
   * Get list of active stations for vehicle registration
   * Public endpoint
   */
  async getStations(_req: Request, res: Response): Promise<void> {
    try {
      const stations = await prisma.station.findMany({
        where: { isActive: true },
        select: {
          id: true,
          name: true,
          nameAr: true,
          governorate: {
            select: {
              id: true,
              name: true,
              nameAr: true
            }
          },
          delegation: {
            select: {
              id: true,
              name: true,
              nameAr: true
            }
          }
        },
        orderBy: [
          { governorate: { name: 'asc' } },
          { delegation: { name: 'asc' } },
          { name: 'asc' }
        ]
      });

      res.json({
        success: true,
        data: stations
      });
    } catch (error: any) {
      console.error('❌ Get stations error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to get stations',
        code: 'GET_STATIONS_ERROR'
      });
    }
  }

  /**
   * PUT /api/v1/vehicles/:id/authorized-stations
   * Update authorized stations for a vehicle
   * Requires: ADMIN role
   */
  async updateVehicleAuthorizedStations(req: Request, res: Response): Promise<void> {
    try {
      const { id: vehicleId } = req.params;
      const { authorizedStationIds } = req.body;

      if (!authorizedStationIds || !Array.isArray(authorizedStationIds)) {
        res.status(400).json({
          success: false,
          message: 'authorizedStationIds must be an array',
          code: 'INVALID_INPUT'
        });
        return;
      }

      const vehicle = await vehicleService.updateVehicleAuthorizedStations(vehicleId, authorizedStationIds);

      res.json({
        success: true,
        data: vehicle,
        message: 'Vehicle authorized stations updated successfully'
      });
    } catch (error: any) {
      console.error('❌ Update vehicle authorized stations error:', error);
      
      if (error.message.includes('not found')) {
        res.status(404).json({
          success: false,
          message: error.message,
          code: 'VEHICLE_NOT_FOUND'
        });
        return;
      }

      if (error.message.includes('at least 2 stations') || error.message.includes('invalid or inactive')) {
        res.status(400).json({
          success: false,
          message: error.message,
          code: 'INVALID_STATIONS'
        });
        return;
      }

      res.status(500).json({
        success: false,
        message: 'Failed to update vehicle authorized stations',
        code: 'UPDATE_AUTHORIZED_STATIONS_ERROR'
      });
    }
  }

  /**
   * GET /api/v1/vehicles/:id/authorized-stations
   * Get authorized stations for a vehicle
   * Requires: STAFF role
   */
  async getVehicleAuthorizedStations(req: Request, res: Response): Promise<void> {
    try {
      const { id: vehicleId } = req.params;
      const { role, station } = req.staff!;

      // Check permissions for supervisor
      if (role === 'SUPERVISOR') {
        const vehicle = await vehicleService.getVehicleById(vehicleId);
        if (vehicle.driver?.assignedStationId !== station?.id) {
          res.status(403).json({
            success: false,
            message: 'You can only view vehicles from your station',
            code: 'STATION_MISMATCH'
          });
          return;
        }
      }

      const authorizedStations = await vehicleService.getVehicleAuthorizedStations(vehicleId);

      res.json({
        success: true,
        data: authorizedStations
      });
    } catch (error: any) {
      console.error('❌ Get vehicle authorized stations error:', error);
      
      if (error.message.includes('not found')) {
        res.status(404).json({
          success: false,
          message: error.message,
          code: 'VEHICLE_NOT_FOUND'
        });
        return;
      }

      res.status(500).json({
        success: false,
        message: 'Failed to get vehicle authorized stations',
        code: 'GET_AUTHORIZED_STATIONS_ERROR'
      });
    }
  }

  /**
   * POST /api/v1/vehicles/:id/check-route
   * Check if vehicle is authorized for a specific route
   * Requires: STAFF role
   */
  async checkVehicleAuthorization(req: Request, res: Response): Promise<void> {
    try {
      const { id: vehicleId } = req.params;
      const { fromStationId, toStationId } = req.body;

      if (!fromStationId || !toStationId) {
        res.status(400).json({
          success: false,
          message: 'fromStationId and toStationId are required',
          code: 'MISSING_STATIONS'
        });
        return;
      }

      const isAuthorized = await vehicleService.isVehicleAuthorizedForRoute(vehicleId, fromStationId, toStationId);

      res.json({
        success: true,
        data: {
          vehicleId,
          fromStationId,
          toStationId,
          isAuthorized
        }
      });
    } catch (error: any) {
      console.error('❌ Check vehicle authorization error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to check vehicle authorization',
        code: 'CHECK_AUTHORIZATION_ERROR'
      });
    }
  }

  /**
   * POST /api/v1/vehicles/:id/ban
   * Ban a vehicle (SUPERVISOR or ADMIN)
   */
  async banVehicle(req: Request, res: Response): Promise<void> {
    try {
      const { id: vehicleId } = req.params;
      const { id: staffId } = req.staff!;
      // Optionally: check supervisor/admin permissions for this vehicle
      const result = await vehicleService.banVehicle(vehicleId, staffId);
      if (result.success) {
        res.json({ success: true, message: 'Vehicle banned successfully' });
      } else {
        res.status(400).json({ success: false, message: result.error || 'Failed to ban vehicle' });
      }
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message || 'Failed to ban vehicle' });
    }
  }
}

export const vehicleController = new VehicleController(); 