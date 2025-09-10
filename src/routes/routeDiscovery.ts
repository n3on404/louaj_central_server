import { Router } from 'express';
import { routeDiscoveryController } from '../controllers/routeDiscovery';

const router = Router();

/**
 * @route GET /api/v1/route-discovery/stations/online
 * @desc Get all online stations that have available destinations
 * @access Public
 */
router.get('/stations/online', routeDiscoveryController.getOnlineStationsWithDestinations.bind(routeDiscoveryController));

/**
 * @route GET /api/v1/route-discovery/route/:departureStationId/:destinationId
 * @desc Get detailed vehicle queue information for a specific route
 * @access Public
 * @param {string} departureStationId - The departure station ID
 * @param {string} destinationId - The destination station ID
 */
router.get('/route/:departureStationId/:destinationId', routeDiscoveryController.getRouteDetails.bind(routeDiscoveryController));


/**
 * @route GET /api/v1/route-discovery/route/:departureStationId/:destinationId
 * @desc Get detailed vehicle queue information for a specific route
 * @access Public
 * @param {string} departureStationId - The departure station ID
 * @param {string} destinationId - The destination station ID
 */
router.get('/route/:departureStationId/:destinationId', routeDiscoveryController.getRouteDetails.bind(routeDiscoveryController));



/**
 * @route GET /api/v1/route-discovery/stations/:stationId
 * @desc Get available destinations for a specific station
 * @access Public
 * @param {string} stationId - The station ID to get destinations for
 */
router.get('/stations/:stationId', routeDiscoveryController.getStationDestinations.bind(routeDiscoveryController));

/**
 * @route GET /api/v1/route-discovery/overnight/:stationId
 * @desc Get available overnight destinations for a specific station
 * @access Public
 * @param {string} stationId - The station ID to get overnight destinations for
 */
router.get('/overnight/:stationId', routeDiscoveryController.getOvernightDestinations.bind(routeDiscoveryController));

/**
 * @route GET /api/v1/route-discovery/overnight/:departureStationId/:destinationId
 * @desc Get detailed vehicle queue information for a specific overnight route
 * @access Public
 * @param {string} departureStationId - The departure station ID
 * @param {string} destinationId - The destination station ID
 */
router.get('/overnight/:departureStationId/:destinationId', routeDiscoveryController.getOvernightRouteDetails.bind(routeDiscoveryController));



/**
 * @route GET /api/v1/route-discovery/station/:stationId/status
 * @desc Get detailed status of a specific station
 * @access Public
 * @param {string} stationId - The station ID to check
 */
router.get('/station/:stationId/status', routeDiscoveryController.getStationStatus.bind(routeDiscoveryController));

/**
 * Health check for route discovery service
 * GET /api/v1/route-discovery/health
 */
router.get('/health', (_req, res) => {
  res.json({
    success: true,
    message: 'Route Discovery service is healthy',
    timestamp: new Date().toISOString(),
    endpoints: {
      stations_online: 'GET /api/v1/route-discovery/stations/online',
      station_destinations: 'GET /api/v1/route-discovery/stations/:stationId',
      route_details: 'GET /api/v1/route-discovery/route/:departureStationId/:destinationId',
      station_status: 'GET /api/v1/route-discovery/station/:stationId/status',
      overnight_destinations: 'GET /api/v1/route-discovery/overnight/:stationId',
      overnight_route_details: 'GET /api/v1/route-discovery/overnight/:departureStationId/:destinationId'
    }
  });
});

export default router;
