import { Request, Response } from 'express';
import { tripService } from '../services/trip';

/**
 * Sync trip from local node
 * POST /api/v1/trips/sync
 */
export const syncTrip = async (req: Request, res: Response): Promise<void> => {
  try {
    const {
      tripId,
      vehicleId,
      licensePlate,
      departureStationId,
      destinationStationId,
      destinationName,
      queueId,
      seatsBooked,
      startTime
    } = req.body;

    // Validate required fields
    if (!tripId || !vehicleId || !licensePlate || !departureStationId || 
        !destinationStationId || !destinationName || !queueId || 
        !seatsBooked || !startTime) {
      res.status(400).json({
        success: false,
        message: 'All fields are required',
        code: 'MISSING_REQUIRED_FIELDS'
      });
      return;
    }

    // Validate that this is coming from a station
    const stationId = req.headers['x-station-id'] as string;
    if (!stationId) {
      res.status(403).json({
        success: false,
        message: 'This endpoint is only accessible by station servers',
        code: 'INVALID_ACCESS'
      });
      return;
    }

    const result = await tripService.syncTripFromStation({
      tripId,
      vehicleId,
      licensePlate,
      departureStationId,
      destinationStationId,
      destinationName,
      queueId,
      seatsBooked,
      startTime: new Date(startTime)
    });

    if (!result.success) {
      res.status(400).json({
        success: false,
        message: result.error || 'Failed to sync trip',
        code: 'TRIP_SYNC_FAILED'
      });
      return;
    }

    console.log(`🚛 Trip synced from station ${stationId}: ${licensePlate} to ${destinationName}`);

    res.status(201).json({
      success: true,
      message: 'Trip synced successfully',
      data: {
        trip: result.trip
      }
    });

  } catch (error: any) {
    console.error('❌ Trip sync error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      code: 'INTERNAL_ERROR'
    });
  }
};

/**
 * Get all trips
 * GET /api/v1/trips
 */
export const getTrips = async (req: Request, res: Response): Promise<void> => {
  try {
    const { page = 1, limit = 10, stationId, vehicleId, status } = req.query;

    const result = await tripService.getTrips({
      page: parseInt(page as string),
      limit: parseInt(limit as string),
      stationId: stationId as string,
      vehicleId: vehicleId as string,
      status: status as string
    });

    if (!result.success) {
      res.status(400).json({
        success: false,
        message: result.error || 'Failed to fetch trips'
      });
      return;
    }

    res.status(200).json({
      success: true,
      data: result.data
    });

  } catch (error: any) {
    console.error('❌ Error fetching trips:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

/**
 * Get trip by ID
 * GET /api/v1/trips/:id
 */
export const getTripById = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    const result = await tripService.getTripById(id);

    if (!result.success) {
      res.status(404).json({
        success: false,
        message: result.error || 'Trip not found'
      });
      return;
    }

    res.status(200).json({
      success: true,
      data: {
        trip: result.trip
      }
    });

  } catch (error: any) {
    console.error('❌ Error fetching trip:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};
