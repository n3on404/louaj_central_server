import { Request, Response } from 'express';
import { queueService } from '../services/queue';
import { QueueStatus } from '@prisma/client';

/**
 * Controller for queue management operations
 */
export class QueueController {

  /**
   * POST /api/v1/queue/vehicle/enter
   * Register vehicle entering station and assign to destination queue (simplified)
   */
  async enterQueue(req: Request, res: Response): Promise<void> {
    try {
      const { licensePlate, queueType, estimatedDeparture } = req.body;
      const { station } = req.staff!;

      // Validate required fields
      if (!licensePlate) {
        res.status(400).json({
          success: false,
          message: 'licensePlate is required',
          code: 'MISSING_FIELD'
        });
        return;
      }

      if (!station?.id) {
        res.status(400).json({
          success: false,
          message: 'Supervisor must be assigned to a station',
          code: 'NO_STATION_ASSIGNED'
        });
        return;
      }

      const result = await queueService.enterQueue({
        licensePlate,
        queueType: queueType || 'REGULAR',
        estimatedDeparture: estimatedDeparture ? new Date(estimatedDeparture) : null
      }, station.id);

      res.status(201).json(result);
    } catch (error: any) {
      console.error('❌ Enter queue error:', error);
      
      if (error.message.includes('not found')) {
        res.status(404).json({
          success: false,
          message: error.message,
          code: 'NOT_FOUND'
        });
        return;
      }

      if (error.message.includes('already in') || error.message.includes('not active') || error.message.includes('No suitable destination')) {
        res.status(400).json({
          success: false,
          message: error.message,
          code: 'INVALID_STATE'
        });
        return;
      }

      res.status(500).json({
        success: false,
        message: 'Failed to enter queue',
        code: 'ENTER_QUEUE_ERROR'
      });
    }
  }

  /**
   * POST /api/v1/queue/vehicle/leave
   * DELETE /api/v1/queue/vehicle/:licensePlate
   * Remove vehicle from queue when it departs station (simplified)
   */
  async leaveQueue(req: Request, res: Response): Promise<void> {
    try {
      const licensePlate = req.params.licensePlate || req.body.licensePlate;

      if (!licensePlate) {
        res.status(400).json({
          success: false,
          message: 'licensePlate is required',
          code: 'MISSING_LICENSE_PLATE'
        });
        return;
      }

      const result = await queueService.leaveQueueByPlate(licensePlate);
      res.json(result);
    } catch (error: any) {
      console.error('❌ Leave queue error:', error);
      
      if (error.message.includes('not found')) {
        res.status(404).json({
          success: false,
          message: error.message,
          code: 'VEHICLE_NOT_IN_QUEUE'
        });
        return;
      }

      res.status(500).json({
        success: false,
        message: 'Failed to leave queue',
        code: 'LEAVE_QUEUE_ERROR'
      });
    }
  }

  /**
   * POST /api/v1/queue/overnight/register
   * Supervisor registers vehicle for overnight priority queue (simplified)
   */
  async registerOvernightQueue(req: Request, res: Response): Promise<void> {
    try {
      const { licensePlate, estimatedDeparture } = req.body;
      const { station } = req.staff!;

      // Validate required fields
      if (!licensePlate) {
        res.status(400).json({
          success: false,
          message: 'licensePlate is required',
          code: 'MISSING_FIELD'
        });
        return;
      }

      if (!station?.id) {
        res.status(400).json({
          success: false,
          message: 'Supervisor must be assigned to a station',
          code: 'NO_STATION_ASSIGNED'
        });
        return;
      }

      const result = await queueService.registerOvernightQueue({
        licensePlate,
        estimatedDeparture: estimatedDeparture ? new Date(estimatedDeparture) : null
      }, station.id);

      res.status(201).json(result);
    } catch (error: any) {
      console.error('❌ Register overnight queue error:', error);
      
      if (error.message.includes('already registered')) {
        res.status(409).json({
          success: false,
          message: error.message,
          code: 'ALREADY_REGISTERED'
        });
        return;
      }

      if (error.message.includes('evening hours')) {
        res.status(400).json({
          success: false,
          message: error.message,
          code: 'INVALID_TIME'
        });
        return;
      }

      if (error.message.includes('not found') || error.message.includes('No suitable destination')) {
        res.status(400).json({
          success: false,
          message: error.message,
          code: 'INVALID_VEHICLE'
        });
        return;
      }

      res.status(500).json({
        success: false,
        message: 'Failed to register for overnight queue',
        code: 'OVERNIGHT_REGISTER_ERROR'
      });
    }
  }

  /**
   * POST /api/v1/queue/overnight/activate
   * Activate overnight vehicles when station opens (4-5 AM)
   */
  async activateOvernightVehicles(req: Request, res: Response): Promise<void> {
    try {
      const { stationId } = req.body;

      if (!stationId) {
        res.status(400).json({
          success: false,
          message: 'stationId is required',
          code: 'MISSING_STATION_ID'
        });
        return;
      }

      const result = await queueService.activateOvernightVehicles(stationId);
      res.json(result);
    } catch (error: any) {
      console.error('❌ Activate overnight vehicles error:', error);
      
      res.status(500).json({
        success: false,
        message: 'Failed to activate overnight vehicles',
        code: 'ACTIVATE_OVERNIGHT_ERROR'
      });
    }
  }

  /**
   * GET /api/v1/queue/station/:stationId/destination/:destinationId
   * Mobile booking system queries available vehicles for specific route
   */
  async getQueueByDestination(req: Request, res: Response): Promise<void> {
    try {
      const { stationId, destinationId } = req.params;

      if (!stationId || !destinationId) {
        res.status(400).json({
          success: false,
          message: 'stationId and destinationId are required',
          code: 'MISSING_PARAMETERS'
        });
        return;
      }

      const result = await queueService.getQueueByDestination(stationId, destinationId);
      res.json(result);
    } catch (error: any) {
      console.error('❌ Get queue by destination error:', error);
      
      res.status(500).json({
        success: false,
        message: 'Failed to get queue by destination',
        code: 'GET_QUEUE_ERROR'
      });
    }
  }

  /**
   * GET /api/v1/queue/station/:stationId/all
   * Station staff dashboard view of all destination queues
   */
  async getAllStationQueues(req: Request, res: Response): Promise<void> {
    try {
      const { stationId } = req.params;

      if (!stationId) {
        res.status(400).json({
          success: false,
          message: 'stationId is required',
          code: 'MISSING_STATION_ID'
        });
        return;
      }

      const result = await queueService.getAllStationQueues(stationId);
      res.json(result);
    } catch (error: any) {
      console.error('❌ Get all station queues error:', error);
      
      res.status(500).json({
        success: false,
        message: 'Failed to get station queues',
        code: 'GET_STATION_QUEUES_ERROR'
      });
    }
  }

  /**
   * PATCH /api/v1/queue/vehicle/:vehicleId/status
   * Update vehicle status (WAITING → LOADING → READY → DEPARTED)
   */
  async updateVehicleStatus(req: Request, res: Response): Promise<void> {
    try {
      const { vehicleId } = req.params;
      const { status } = req.body;

      if (!vehicleId || !status) {
        res.status(400).json({
          success: false,
          message: 'vehicleId and status are required',
          code: 'MISSING_PARAMETERS'
        });
        return;
      }

      // Validate status is valid QueueStatus
      const validStatuses: QueueStatus[] = ['WAITING', 'LOADING', 'READY', 'DEPARTED'];
      if (!validStatuses.includes(status as QueueStatus)) {
        res.status(400).json({
          success: false,
          message: `Invalid status. Must be one of: ${validStatuses.join(', ')}`,
          code: 'INVALID_STATUS'
        });
        return;
      }

      const result = await queueService.updateVehicleStatus(vehicleId, status as QueueStatus);
      res.json(result);
    } catch (error: any) {
      console.error('❌ Update vehicle status error:', error);
      
      if (error.message.includes('not found')) {
        res.status(404).json({
          success: false,
          message: error.message,
          code: 'VEHICLE_NOT_IN_QUEUE'
        });
        return;
      }

      res.status(500).json({
        success: false,
        message: 'Failed to update vehicle status',
        code: 'UPDATE_STATUS_ERROR'
      });
    }
  }

  /**
   * PATCH /api/v1/queue/vehicle/:vehicleId/position
   * Supervisor manually adjusts queue positions if needed
   */
  async updateVehiclePosition(req: Request, res: Response): Promise<void> {
    try {
      const { vehicleId } = req.params;
      const { position } = req.body;

      if (!vehicleId || position === undefined) {
        res.status(400).json({
          success: false,
          message: 'vehicleId and position are required',
          code: 'MISSING_PARAMETERS'
        });
        return;
      }

      const newPosition = parseInt(position);
      if (isNaN(newPosition) || newPosition < 1) {
        res.status(400).json({
          success: false,
          message: 'Position must be a positive integer',
          code: 'INVALID_POSITION'
        });
        return;
      }

      const result = await queueService.updateVehiclePosition(vehicleId, newPosition);
      res.json(result);
    } catch (error: any) {
      console.error('❌ Update vehicle position error:', error);
      
      if (error.message.includes('not found')) {
        res.status(404).json({
          success: false,
          message: error.message,
          code: 'VEHICLE_NOT_IN_QUEUE'
        });
        return;
      }

      res.status(500).json({
        success: false,
        message: 'Failed to update vehicle position',
        code: 'UPDATE_POSITION_ERROR'
      });
    }
  }

  /**
   * GET /api/v1/queue/vehicle/:vehicleId
   * Get vehicle's current queue information
   */
  async getVehicleQueueInfo(req: Request, res: Response): Promise<void> {
    try {
      const { vehicleId } = req.params;

      if (!vehicleId) {
        res.status(400).json({
          success: false,
          message: 'vehicleId is required',
          code: 'MISSING_VEHICLE_ID'
        });
        return;
      }

      const result = await queueService.getVehicleQueueInfo(vehicleId);
      res.json(result);
    } catch (error: any) {
      console.error('❌ Get vehicle queue info error:', error);
      
      res.status(500).json({
        success: false,
        message: 'Failed to get vehicle queue information',
        code: 'GET_VEHICLE_QUEUE_ERROR'
      });
    }
  }
}

export const queueController = new QueueController(); 