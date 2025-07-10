import { Request, Response } from 'express';
import { RouteService, CreateRouteData, UpdateRouteData, RouteFilters } from '../services/route';

const routeService = new RouteService();

/**
 * Create a new route (ADMIN only)
 * POST /api/v1/routes
 */
export const createRoute = async (req: Request, res: Response): Promise<void> => {
  try {
    const { departureStationId, destinationStationId, basePrice, isActive } = req.body;

    // Validate required fields
    if (!departureStationId || !destinationStationId || basePrice === undefined) {
      res.status(400).json({
        success: false,
        message: 'Departure station, destination station, and base price are required',
        code: 'MISSING_REQUIRED_FIELDS'
      });
      return;
    }

    // Validate base price
    if (typeof basePrice !== 'number' || basePrice <= 0) {
      res.status(400).json({
        success: false,
        message: 'Base price must be a positive number',
        code: 'INVALID_BASE_PRICE'
      });
      return;
    }

    const routeData: CreateRouteData = {
      departureStationId,
      destinationStationId,
      basePrice,
      isActive: isActive !== undefined ? isActive : true
    };

    const result = await routeService.createRoute(routeData);

    console.log(`🛣️ Route created: ${result.data.departureStation.name} → ${result.data.destinationStation.name} by admin ${req.staff!.firstName} ${req.staff!.lastName}`);

    res.status(201).json(result);
  } catch (error: any) {
    console.error('❌ Error creating route:', error);
    res.status(400).json({
      success: false,
      message: error.message,
      code: 'ROUTE_CREATION_FAILED'
    });
  }
};

/**
 * Get all routes with optional filtering and pagination (ADMIN only)
 * GET /api/v1/routes
 */
export const getAllRoutes = async (req: Request, res: Response): Promise<void> => {
  try {
    const { 
      page = 1, 
      limit = 10, 
      search, 
      departureStationId, 
      destinationStationId, 
      isActive 
    } = req.query;

    const filters: RouteFilters = {};
    
    if (search) filters.search = search as string;
    if (departureStationId) filters.departureStationId = departureStationId as string;
    if (destinationStationId) filters.destinationStationId = destinationStationId as string;
    if (isActive !== undefined) filters.isActive = isActive === 'true';

    const result = await routeService.getRoutes(
      filters, 
      Number(page), 
      Number(limit)
    );

    res.json(result);
  } catch (error: any) {
    console.error('❌ Error getting routes:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve routes',
      error: error.message
    });
  }
};

/**
 * Get route by ID
 * GET /api/v1/routes/:id
 */
export const getRouteById = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    const result = await routeService.getRouteById(id);

    res.json(result);
  } catch (error: any) {
    console.error('❌ Error getting route:', error);
    res.status(404).json({
      success: false,
      message: error.message,
      code: 'ROUTE_NOT_FOUND'
    });
  }
};

/**
 * Update route by ID (ADMIN only)
 * PUT /api/v1/routes/:id
 */
export const updateRoute = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { departureStationId, destinationStationId, basePrice, isActive } = req.body;

    // Validate base price if provided
    if (basePrice !== undefined && (typeof basePrice !== 'number' || basePrice <= 0)) {
      res.status(400).json({
        success: false,
        message: 'Base price must be a positive number',
        code: 'INVALID_BASE_PRICE'
      });
      return;
    }

    const updateData: UpdateRouteData = {};
    
    if (departureStationId !== undefined) updateData.departureStationId = departureStationId;
    if (destinationStationId !== undefined) updateData.destinationStationId = destinationStationId;
    if (basePrice !== undefined) updateData.basePrice = basePrice;
    if (isActive !== undefined) updateData.isActive = isActive;

    const result = await routeService.updateRoute(id, updateData);

    console.log(`🛣️ Route updated: ${result.data.departureStation.name} → ${result.data.destinationStation.name} by admin ${req.staff!.firstName} ${req.staff!.lastName}`);

    res.json(result);
  } catch (error: any) {
    console.error('❌ Error updating route:', error);
    res.status(400).json({
      success: false,
      message: error.message,
      code: 'ROUTE_UPDATE_FAILED'
    });
  }
};

/**
 * Delete route by ID (ADMIN only)
 * DELETE /api/v1/routes/:id
 */
export const deleteRoute = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    const result = await routeService.deleteRoute(id);

    console.log(`🗑️ Route deleted: ID ${id} by admin ${req.staff!.firstName} ${req.staff!.lastName}`);

    res.json(result);
  } catch (error: any) {
    console.error('❌ Error deleting route:', error);
    res.status(400).json({
      success: false,
      message: error.message,
      code: 'ROUTE_DELETION_FAILED'
    });
  }
};

/**
 * Get routes by departure station
 * GET /api/v1/routes/departure/:stationId
 */
export const getRoutesByDepartureStation = async (req: Request, res: Response): Promise<void> => {
  try {
    const { stationId } = req.params;

    const result = await routeService.getRoutesByDepartureStation(stationId);

    res.json(result);
  } catch (error: any) {
    console.error('❌ Error getting routes by departure station:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve routes',
      error: error.message
    });
  }
};

/**
 * Get routes by destination station
 * GET /api/v1/routes/destination/:stationId
 */
export const getRoutesByDestinationStation = async (req: Request, res: Response): Promise<void> => {
  try {
    const { stationId } = req.params;

    const result = await routeService.getRoutesByDestinationStation(stationId);

    res.json(result);
  } catch (error: any) {
    console.error('❌ Error getting routes by destination station:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve routes',
      error: error.message
    });
  }
};

/**
 * Get all active routes
 * GET /api/v1/routes/active
 */
export const getActiveRoutes = async (_req: Request, res: Response): Promise<void> => {
  try {
    const result = await routeService.getActiveRoutes();

    res.json(result);
  } catch (error: any) {
    console.error('❌ Error getting active routes:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve active routes',
      error: error.message
    });
  }
};

/**
 * Toggle route active status (ADMIN only)
 * PATCH /api/v1/routes/:id/toggle
 */
export const toggleRouteStatus = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    const result = await routeService.toggleRouteStatus(id);

    console.log(`🔄 Route status toggled: ID ${id} by admin ${req.staff!.firstName} ${req.staff!.lastName}`);

    res.json(result);
  } catch (error: any) {
    console.error('❌ Error toggling route status:', error);
    res.status(400).json({
      success: false,
      message: error.message,
      code: 'ROUTE_STATUS_TOGGLE_FAILED'
    });
  }
};

/**
 * Search routes by station ID
 * GET /api/v1/routes/search/:stationId
 */
export const searchRoutesByStation = async (req: Request, res: Response): Promise<void> => {
  try {
    const { stationId } = req.params;

    const result = await routeService.searchRoutesByStation(stationId);

    res.json(result);
  } catch (error: any) {
    console.error('❌ Error searching routes by station:', error);
    res.status(404).json({
      success: false,
      message: error.message,
      code: 'STATION_NOT_FOUND'
    });
  }
};

/**
 * Update route price by station ID (with bidirectional route matching)
 * PUT /api/v1/routes/:stationId/price
 */
export const updateRoutePrice = async (req: Request, res: Response): Promise<void> => {
  try {
    const { stationId } = req.params;
    const { basePrice, targetStationId } = req.body;

    // Validate base price
    if (!basePrice || typeof basePrice !== 'number' || basePrice <= 0) {
      res.status(400).json({
        success: false,
        message: 'Base price must be a positive number',
        code: 'INVALID_BASE_PRICE'
      });
      return;
    }

    // If targetStationId is provided, update specific route between two stations
    if (targetStationId) {
      const result = await routeService.updateRoutePriceBetweenStations(stationId, targetStationId, basePrice);
      
      console.log(`💰 Route price updated between stations ${stationId} ↔ ${targetStationId}: ${basePrice} TND`);

      res.json({
        success: true,
        message: `Route price updated between stations ${stationId} and ${targetStationId}`,
        data: result
      });
    } else {
      // Update all routes for the station (backward compatibility)
      const result = await routeService.updateRoutePriceByStation(stationId, basePrice);
      
      console.log(`💰 Route price updated for station ${stationId}: ${basePrice} TND`);

      res.json({
        success: true,
        message: `Route prices updated for station ${stationId}`,
        data: result
      });
    }
  } catch (error: any) {
    console.error('❌ Error updating route price:', error);
    res.status(400).json({
      success: false,
      message: error.message,
      code: 'ROUTE_PRICE_UPDATE_FAILED'
    });
  }
}; 