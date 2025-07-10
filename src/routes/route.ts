import { Router } from 'express';
import {
  createRoute,
  getAllRoutes,
  getRouteById,
  updateRoute,
  deleteRoute,
  getRoutesByDepartureStation,
  getRoutesByDestinationStation,
  getActiveRoutes,
  toggleRouteStatus,
  searchRoutesByStation,
  updateRoutePrice
} from '../controllers/route';


const router = Router();

// =============== ADMIN-ONLY ROUTES ===============

/**
 * Create a new route (ADMIN only)
 * POST /api/v1/routes
 */
router.post('/',
 
  createRoute
);

/**
 * Get all routes with optional filtering and pagination (ADMIN only)
 * GET /api/v1/routes
 */
router.get('/',
 
  getAllRoutes
);

/**
 * Get route by ID
 * GET /api/v1/routes/:id
 */
router.get('/:id',
  getRouteById
);

/**
 * Update route by ID (ADMIN only)
 * PUT /api/v1/routes/:id
 */
router.put('/:id',
 
  updateRoute
);

/**
 * Delete route by ID (ADMIN only)
 * DELETE /api/v1/routes/:id
 */
router.delete('/:id',
 
  deleteRoute
);

/**
 * Toggle route active status (ADMIN only)
 * PATCH /api/v1/routes/:id/toggle
 */
router.patch('/:id/toggle',
 
  toggleRouteStatus
);

// =============== PUBLIC ROUTES ===============

/**
 * Get routes by departure station
 * GET /api/v1/routes/departure/:stationId
 */
router.get('/departure/:stationId',
  getRoutesByDepartureStation
);

/**
 * Get routes by destination station
 * GET /api/v1/routes/destination/:stationId
 */
router.get('/destination/:stationId',
  getRoutesByDestinationStation
);

/**
 * Get all active routes
 * GET /api/v1/routes/active
 */
router.get('/active',
  getActiveRoutes
);

/**
 * Search routes by station ID
 * GET /api/v1/routes/search/:stationId
 */
router.get('/search/:stationId',
  searchRoutesByStation
);

/**
 * Update route price by station ID
 * PUT /api/v1/routes/:stationId/price
 */
router.put('/:stationId/price',
  updateRoutePrice
);

/**
 * Health check for routes service
 * GET /api/v1/routes/health
 */
router.get('/health/check', (_req, res) => {
  res.json({
    success: true,
    message: 'Routes service is healthy',
    timestamp: new Date().toISOString(),
    endpoints: {
      admin: {
        create_route: 'POST /api/v1/routes',
        get_all_routes: 'GET /api/v1/routes',
        get_route: 'GET /api/v1/routes/:id',
        update_route: 'PUT /api/v1/routes/:id',
        delete_route: 'DELETE /api/v1/routes/:id',
        toggle_route_status: 'PATCH /api/v1/routes/:id/toggle'
      },
      public: {
        get_routes_by_departure: 'GET /api/v1/routes/departure/:stationId',
        get_routes_by_destination: 'GET /api/v1/routes/destination/:stationId',
        get_active_routes: 'GET /api/v1/routes/active',
        search_routes_by_station: 'GET /api/v1/routes/search/:stationId'
      }
    }
  });
});

export default router; 