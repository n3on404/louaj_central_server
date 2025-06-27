import { Router } from 'express';
import { queueController } from '../controllers/queue';
import { authenticate, requireSupervisor, requireStaff } from '../middleware/auth';

const router = Router();

// =============== PUBLIC ENDPOINTS ===============

/**
 * GET /api/v1/queue/station/:stationId/destination/:destinationId
 * Mobile booking system queries available vehicles for specific route
 * Public endpoint for mobile app booking queries
 */
router.get('/station/:stationId/destination/:destinationId', 
  queueController.getQueueByDestination.bind(queueController)
);

/**
 * GET /api/v1/queue/vehicle/:vehicleId
 * Get vehicle's current queue information
 * Public endpoint for driver mobile app
 */
router.get('/vehicle/:vehicleId', 
  queueController.getVehicleQueueInfo.bind(queueController)
);

// =============== AUTHENTICATED ENDPOINTS ===============

// Apply authentication middleware for all following routes
router.use(authenticate);

// =============== STAFF ENDPOINTS (All authenticated staff can view) ===============

/**
 * GET /api/v1/queue/station/:stationId/all
 * Station staff dashboard view of all destination queues
 * Requires: Any authenticated staff role
 */
router.get('/station/:stationId/all', 
  requireStaff,
  queueController.getAllStationQueues.bind(queueController)
);

// =============== SUPERVISOR/ADMIN ENDPOINTS ===============

/**
 * POST /api/v1/queue/vehicle/enter
 * Register vehicle entering station and assign to destination queue
 * Requires: SUPERVISOR or ADMIN role
 */
router.post('/vehicle/enter', 
  requireSupervisor,
  queueController.enterQueue.bind(queueController)
);

/**
 * POST /api/v1/queue/vehicle/leave
 * Remove vehicle from queue when it departs station (POST version)
 * Requires: SUPERVISOR or ADMIN role
 */
router.post('/vehicle/leave', 
  requireSupervisor,
  queueController.leaveQueue.bind(queueController)
);

/**
 * DELETE /api/v1/queue/vehicle/:licensePlate
 * Remove vehicle from queue when it departs station (DELETE version)
 * Requires: SUPERVISOR or ADMIN role
 */
router.delete('/vehicle/:licensePlate', 
  requireSupervisor,
  queueController.leaveQueue.bind(queueController)
);

/**
 * POST /api/v1/queue/overnight/register
 * Supervisor registers vehicle for overnight priority queue
 * Requires: SUPERVISOR or ADMIN role
 */
router.post('/overnight/register', 
  requireSupervisor,
  queueController.registerOvernightQueue.bind(queueController)
);

/**
 * POST /api/v1/queue/overnight/activate
 * Activate overnight vehicles when station opens (4-5 AM)
 * Requires: SUPERVISOR or ADMIN role
 */
router.post('/overnight/activate', 
  requireSupervisor,
  queueController.activateOvernightVehicles.bind(queueController)
);

/**
 * PATCH /api/v1/queue/vehicle/:vehicleId/status
 * Update vehicle status (WAITING → LOADING → READY → DEPARTED)
 * Requires: SUPERVISOR or ADMIN role
 */
router.patch('/vehicle/:vehicleId/status', 
  requireSupervisor,
  queueController.updateVehicleStatus.bind(queueController)
);

/**
 * PATCH /api/v1/queue/vehicle/:vehicleId/position
 * Supervisor manually adjusts queue positions if needed
 * Requires: SUPERVISOR or ADMIN role
 */
router.patch('/vehicle/:vehicleId/position', 
  requireSupervisor,
  queueController.updateVehiclePosition.bind(queueController)
);

export default router; 