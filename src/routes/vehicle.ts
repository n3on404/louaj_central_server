import { Router } from 'express';
import { vehicleController } from '../controllers/vehicle';
import { authenticate, requireAdmin, requireSupervisor, validateCIN, validatePhoneNumber } from '../middleware/auth';

const router = Router();

// =============== PUBLIC ENDPOINTS ===============

/**
 * POST /api/v1/vehicles/request
 * Submit driver account request with vehicle info
 * Public endpoint - no authentication required
 */
router.post('/request', 
  validateCIN,
  validatePhoneNumber,
  vehicleController.submitDriverRequest.bind(vehicleController)
);

/**
 * GET /api/v1/vehicles/governorates
 * Get list of governorates for driver request form
 * Public endpoint
 */
router.get('/governorates', 
  vehicleController.getGovernorates.bind(vehicleController)
);

/**
 * GET /api/v1/vehicles/delegations/:governorateId
 * Get delegations for a specific governorate
 * Public endpoint
 */
router.get('/delegations/:governorateId', 
  vehicleController.getDelegations.bind(vehicleController)
);

/**
 * GET /api/v1/vehicles/stations
 * Get list of active stations for vehicle registration
 * Public endpoint
 */
router.get('/stations', 
  vehicleController.getStations.bind(vehicleController)
);

// =============== AUTHENTICATED ENDPOINTS ===============

// Apply authentication middleware for all following routes
router.use(authenticate);

// =============== SUPERVISOR/ADMIN ENDPOINTS ===============

/**
 * GET /api/v1/vehicles/pending
 * Get pending driver requests for supervisor's station (or all for admin)
 * Requires: SUPERVISOR or ADMIN role
 */
router.get('/pending', 
  requireSupervisor,
  vehicleController.getPendingRequests.bind(vehicleController)
);

/**
 * POST /api/v1/vehicles/:id/approve
 * Approve a driver request
 * Requires: SUPERVISOR or ADMIN role
 */
router.post('/:id/approve', 
  requireSupervisor,
  vehicleController.approveDriverRequest.bind(vehicleController)
);

/**
 * POST /api/v1/vehicles/:id/deny
 * Deny a driver request
 * Requires: SUPERVISOR or ADMIN role
 */
router.post('/:id/deny', 
  requireSupervisor,
  vehicleController.denyDriverRequest.bind(vehicleController)
);

/**
 * GET /api/v1/vehicles
 * Get vehicles with pagination and filtering
 * Requires: SUPERVISOR or ADMIN role
 */
router.get('/', 
  requireSupervisor,
  vehicleController.getVehicles.bind(vehicleController)
);

/**
 * GET /api/v1/vehicles/:id
 * Get single vehicle by ID
 * Requires: SUPERVISOR or ADMIN role
 */
router.get('/:id', 
  requireSupervisor,
  vehicleController.getVehicleById.bind(vehicleController)
);

/**
 * GET /api/v1/vehicles/:id/authorized-stations
 * Get authorized stations for a vehicle
 * Requires: SUPERVISOR or ADMIN role
 */
router.get('/:id/authorized-stations', 
  requireSupervisor,
  vehicleController.getVehicleAuthorizedStations.bind(vehicleController)
);

/**
 * POST /api/v1/vehicles/:id/check-route
 * Check if vehicle is authorized for a specific route
 * Requires: SUPERVISOR or ADMIN role
 */
router.post('/:id/check-route', 
  requireSupervisor,
  vehicleController.checkVehicleAuthorization.bind(vehicleController)
);

/**
 * POST /api/v1/vehicles/:id/ban
 * Ban a vehicle (SUPERVISOR or ADMIN)
 */
router.post('/:id/ban', requireSupervisor, vehicleController.banVehicle.bind(vehicleController));

// =============== ADMIN-ONLY ENDPOINTS ===============

/**
 * PUT /api/v1/vehicles/:id
 * Update vehicle information
 * Requires: ADMIN role only
 */
router.put('/:id', 
  requireAdmin,
  vehicleController.updateVehicle.bind(vehicleController)
);

/**
 * DELETE /api/v1/vehicles/:id
 * Delete vehicle and associated driver
 * Requires: ADMIN role only
 */
router.delete('/:id', 
  requireAdmin,
  vehicleController.deleteVehicle.bind(vehicleController)
);

/**
 * PUT /api/v1/vehicles/:id/authorized-stations
 * Update authorized stations for a vehicle
 * Requires: ADMIN role only
 */
router.put('/:id/authorized-stations', 
  requireAdmin,
  vehicleController.updateVehicleAuthorizedStations.bind(vehicleController)
);

export default router; 