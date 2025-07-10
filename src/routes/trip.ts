import { Router } from 'express';
import { syncTrip, getTrips, getTripById } from '../controllers/trip';

const router = Router();

/**
 * @route POST /api/v1/trips/sync
 * @desc Sync trip from local station
 * @body { tripId, vehicleId, licensePlate, departureStationId, destinationStationId, destinationName, queueId, seatsBooked, startTime }
 * @access Station servers only
 */
router.post('/sync', syncTrip);

/**
 * @route GET /api/v1/trips
 * @desc Get trips with filtering and pagination
 * @query { page?, limit?, stationId?, vehicleId?, status? }
 * @access Private (requires authentication)
 */
router.get('/', getTrips);

/**
 * @route GET /api/v1/trips/:id
 * @desc Get trip by ID
 * @params { id }
 * @access Private (requires authentication)
 */
router.get('/:id', getTripById);

export default router;
