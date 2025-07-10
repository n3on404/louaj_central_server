import { Router } from 'express';
import {
  createStation,
  getAllStations,
  getStationById,
  updateStation,
  deleteStation,
  assignSupervisor,
  removeSupervisor,
  getMyStation,
  updateMyStation
} from '../controllers/stations';
import {
  authenticate,
  requireAdmin,
  requireSupervisor
} from '../middleware/auth';

const router = Router();

// =============== ADMIN-ONLY ROUTES ===============

/**
 * Create a new station (ADMIN only)
 * POST /api/v1/stations
 */
router.post('/',
  authenticate,
  requireSupervisor,
  createStation
);

/**
 * Get all stations (ADMIN only)
 * GET /api/v1/stations
 */
router.get('/',
  authenticate,
  requireAdmin,
  getAllStations
);

/**
 * Get station by ID (ADMIN only)
 * GET /api/v1/stations/:id
 */
router.get('/:id',
  getStationById
);

/**
 * Update station (ADMIN only)
 * PUT /api/v1/stations/:id
 */
router.put('/:id',
  authenticate,
  requireAdmin,
  updateStation
);

/**
 * Delete station (ADMIN only)
 * DELETE /api/v1/stations/:id
 */
router.delete('/:id',
  authenticate,
  requireAdmin,
  deleteStation
);

/**
 * Assign supervisor to station (ADMIN only)
 * POST /api/v1/stations/:id/supervisor
 */
router.post('/:id/supervisor',
  authenticate,
  requireAdmin,
  assignSupervisor
);

/**
 * Remove supervisor from station (ADMIN only)
 * DELETE /api/v1/stations/:id/supervisor
 */
router.delete('/:id/supervisor',
  authenticate,
  requireAdmin,
  removeSupervisor
);

// =============== SUPERVISOR ROUTES ===============

/**
 * Get my station (SUPERVISOR only)
 * GET /api/v1/stations/my
 */
router.get('/my/station',
  authenticate,
  requireSupervisor,
  getMyStation
);

/**
 * Update my station info (SUPERVISOR only)
 * PUT /api/v1/stations/my
 */
router.put('/my/station',
  authenticate,
  requireSupervisor,
  updateMyStation
);

/**
 * Health check for stations service
 * GET /api/v1/stations/health
 */
router.get('/health/check', (_req, res) => {
  res.json({
    success: true,
    message: 'Stations service is healthy',
    timestamp: new Date().toISOString(),
    endpoints: {
      admin: {
        create_station: 'POST /api/v1/stations',
        get_all_stations: 'GET /api/v1/stations',
        get_station: 'GET /api/v1/stations/:id',
        update_station: 'PUT /api/v1/stations/:id',
        delete_station: 'DELETE /api/v1/stations/:id',
        assign_supervisor: 'POST /api/v1/stations/:id/supervisor',
        remove_supervisor: 'DELETE /api/v1/stations/:id/supervisor'
      },
      supervisor: {
        get_my_station: 'GET /api/v1/stations/my/station',
        update_my_station: 'PUT /api/v1/stations/my/station'
      }
    }
  });
});

export default router; 