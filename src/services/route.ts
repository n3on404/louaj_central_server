import { prisma } from '../config/database';

export interface CreateRouteData {
  departureStationId: string;
  destinationStationId: string;
  basePrice: number;
  isActive?: boolean;
}

export interface UpdateRouteData {
  departureStationId?: string;
  destinationStationId?: string;
  basePrice?: number;
  isActive?: boolean;
}

export interface RouteFilters {
  search?: string;
  departureStationId?: string;
  destinationStationId?: string;
  isActive?: boolean;
}

/**
 * Service class for handling routes
 */
export class RouteService {
  
  /**
   * Create a new route
   */
  async createRoute(data: CreateRouteData) {
    // Validate that both stations exist
    const [departureStation, destinationStation] = await Promise.all([
      prisma.station.findUnique({
        where: { id: data.departureStationId },
        include: {
          governorate: true,
          delegation: true
        }
      }),
      prisma.station.findUnique({
        where: { id: data.destinationStationId },
        include: {
          governorate: true,
          delegation: true
        }
      })
    ]);

    if (!departureStation) {
      throw new Error('Departure station not found');
    }

    if (!destinationStation) {
      throw new Error('Destination station not found');
    }

    if (data.departureStationId === data.destinationStationId) {
      throw new Error('Departure and destination stations cannot be the same');
    }

    // Check if route already exists
    const existingRoute = await prisma.route.findFirst({
      where: {
        departureStationId: data.departureStationId,
        destinationStationId: data.destinationStationId
      }
    });

    if (existingRoute) {
      throw new Error('Route already exists between these stations');
    }

    // Create the route
    const route = await prisma.route.create({
      data: {
        departureStationId: data.departureStationId,
        destinationStationId: data.destinationStationId,
        basePrice: data.basePrice,
        isActive: data.isActive ?? true
      },
      include: {
        departureStation: {
          include: {
            governorate: true,
            delegation: true
          }
        },
        destinationStation: {
          include: {
            governorate: true,
            delegation: true
          }
        }
      }
    });

    return {
      success: true,
      message: 'Route created successfully',
      data: route
    };
  }

  /**
   * Get all routes with optional filtering and pagination
   */
  async getRoutes(filters: RouteFilters = {}, page: number = 1, limit: number = 10) {
    const offset = (page - 1) * limit;

    // Build where clause
    const where: any = {};

    if (filters.departureStationId) {
      where.departureStationId = filters.departureStationId;
    }

    if (filters.destinationStationId) {
      where.destinationStationId = filters.destinationStationId;
    }

    if (filters.isActive !== undefined) {
      where.isActive = filters.isActive;
    }

    if (filters.search) {
      where.OR = [
        {
          departureStation: {
            OR: [
              { name: { contains: filters.search, mode: 'insensitive' } },
              { nameAr: { contains: filters.search, mode: 'insensitive' } }
            ]
          }
        },
        {
          destinationStation: {
            OR: [
              { name: { contains: filters.search, mode: 'insensitive' } },
              { nameAr: { contains: filters.search, mode: 'insensitive' } }
            ]
          }
        }
      ];
    }

    const [routes, total] = await Promise.all([
      prisma.route.findMany({
        where,
        skip: offset,
        take: limit,
        include: {
          departureStation: {
            include: {
              governorate: true,
              delegation: true
            }
          },
          destinationStation: {
            include: {
              governorate: true,
              delegation: true
            }
          }
        },
        orderBy: { createdAt: 'desc' }
      }),
      prisma.route.count({ where })
    ]);

    return {
      success: true,
      message: 'Routes retrieved successfully',
      data: {
        routes,
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit)
        }
      }
    };
  }

  /**
   * Get route by ID
   */
  async getRouteById(routeId: string) {
    const route = await prisma.route.findUnique({
      where: { id: routeId },
      include: {
        departureStation: {
          include: {
            governorate: true,
            delegation: true
          }
        },
        destinationStation: {
          include: {
            governorate: true,
            delegation: true
          }
        }
      }
    });

    if (!route) {
      throw new Error('Route not found');
    }

    return {
      success: true,
      message: 'Route retrieved successfully',
      data: route
    };
  }

  /**
   * Update route by ID
   */
  async updateRoute(routeId: string, data: UpdateRouteData) {
    // Check if route exists
    const existingRoute = await prisma.route.findUnique({
      where: { id: routeId }
    });

    if (!existingRoute) {
      throw new Error('Route not found');
    }

    // Validate stations if provided
    if (data.departureStationId) {
      const departureStation = await prisma.station.findUnique({
        where: { id: data.departureStationId }
      });

      if (!departureStation) {
        throw new Error('Departure station not found');
      }
    }

    if (data.destinationStationId) {
      const destinationStation = await prisma.station.findUnique({
        where: { id: data.destinationStationId }
      });

      if (!destinationStation) {
        throw new Error('Destination station not found');
      }
    }

    // Check for duplicate route if stations are being changed
    if (data.departureStationId || data.destinationStationId) {
      const newDepartureId = data.departureStationId || existingRoute.departureStationId;
      const newDestinationId = data.destinationStationId || existingRoute.destinationStationId;

      if (newDepartureId === newDestinationId) {
        throw new Error('Departure and destination stations cannot be the same');
      }

      const duplicateRoute = await prisma.route.findFirst({
        where: {
          departureStationId: newDepartureId,
          destinationStationId: newDestinationId,
          id: { not: routeId }
        }
      });

      if (duplicateRoute) {
        throw new Error('Route already exists between these stations');
      }
    }

    // Update the route
    const updatedRoute = await prisma.route.update({
      where: { id: routeId },
      data: {
        ...(data.departureStationId && { departureStationId: data.departureStationId }),
        ...(data.destinationStationId && { destinationStationId: data.destinationStationId }),
        ...(data.basePrice !== undefined && { basePrice: data.basePrice }),
        ...(data.isActive !== undefined && { isActive: data.isActive })
      },
      include: {
        departureStation: {
          include: {
            governorate: true,
            delegation: true
          }
        },
        destinationStation: {
          include: {
            governorate: true,
            delegation: true
          }
        }
      }
    });

    return {
      success: true,
      message: 'Route updated successfully',
      data: updatedRoute
    };
  }

  /**
   * Delete route by ID
   */
  async deleteRoute(routeId: string) {
    // Check if route exists
    const existingRoute = await prisma.route.findUnique({
      where: { id: routeId }
    });

    if (!existingRoute) {
      throw new Error('Route not found');
    }

    // Check if route has any associated bookings
    const bookingCount = await prisma.booking.count({
      where: {
        departureStationId: existingRoute.departureStationId,
        destinationStationId: existingRoute.destinationStationId
      }
    });

    if (bookingCount > 0) {
      throw new Error(`Cannot delete route: ${bookingCount} booking(s) are associated with this route`);
    }

    // Delete the route
    await prisma.route.delete({
      where: { id: routeId }
    });

    return {
      success: true,
      message: 'Route deleted successfully'
    };
  }

  /**
   * Get routes by departure station
   */
  async getRoutesByDepartureStation(stationId: string) {
    const routes = await prisma.route.findMany({
      where: {
        departureStationId: stationId,
        isActive: true
      },
      include: {
        destinationStation: {
          include: {
            governorate: true,
            delegation: true
          }
        }
      },
      orderBy: {
        destinationStation: {
          name: 'asc'
        }
      }
    });

    return {
      success: true,
      message: 'Routes retrieved successfully',
      data: routes
    };
  }

  /**
   * Get routes by destination station
   */
  async getRoutesByDestinationStation(stationId: string) {
    const routes = await prisma.route.findMany({
      where: {
        destinationStationId: stationId,
        isActive: true
      },
      include: {
        departureStation: {
          include: {
            governorate: true,
            delegation: true
          }
        }
      },
      orderBy: {
        departureStation: {
          name: 'asc'
        }
      }
    });

    return {
      success: true,
      message: 'Routes retrieved successfully',
      data: routes
    };
  }

  /**
   * Get all active routes
   */
  async getActiveRoutes() {
    const routes = await prisma.route.findMany({
      where: {
        isActive: true
      },
      include: {
        departureStation: {
          include: {
            governorate: true,
            delegation: true
          }
        },
        destinationStation: {
          include: {
            governorate: true,
            delegation: true
          }
        }
      },
      orderBy: [
        {
          departureStation: {
            name: 'asc'
          }
        },
        {
          destinationStation: {
            name: 'asc'
          }
        }
      ]
    });

    return {
      success: true,
      message: 'Active routes retrieved successfully',
      data: routes
    };
  }

  /**
   * Toggle route active status
   */
  async toggleRouteStatus(routeId: string) {
    const route = await prisma.route.findUnique({
      where: { id: routeId }
    });

    if (!route) {
      throw new Error('Route not found');
    }

    const updatedRoute = await prisma.route.update({
      where: { id: routeId },
      data: {
        isActive: !route.isActive
      },
      include: {
        departureStation: {
          include: {
            governorate: true,
            delegation: true
          }
        },
        destinationStation: {
          include: {
            governorate: true,
            delegation: true
          }
        }
      }
    });

    return {
      success: true,
      message: `Route ${updatedRoute.isActive ? 'activated' : 'deactivated'} successfully`,
      data: updatedRoute
    };
  }

  /**
   * Search routes by station ID - returns all routes connected to the station
   */
  async searchRoutesByStation(stationId: string) {
    try {
      // First check if the station exists
      const station = await prisma.station.findUnique({
        where: { id: stationId }
      });

      if (!station) {
        throw new Error('Station not found');
      }

      // Get all routes where this station is either departure or destination
      const routes = await prisma.route.findMany({
        where: {
          OR: [
            { departureStationId: stationId },
            { destinationStationId: stationId }
          ],
          isActive: true
        },
        include: {
          departureStation: {
            include: {
              governorate: true,
              delegation: true
            }
          },
          destinationStation: {
            include: {
              governorate: true,
              delegation: true
            }
          }
        },
        orderBy: [
          {
            departureStation: {
              name: 'asc'
            }
          },
          {
            destinationStation: {
              name: 'asc'
            }
          }
        ]
      });

      // Create a simple array with station_id, station_name, base_price, governorate, and delegation
      const connectedStations = routes.map(route => {
        // If the searched station is the departure, return the destination station
        if (route.departureStationId === stationId) {
          return {
            station_id: route.destinationStation.id,
            station_name: route.destinationStation.name,
            base_price: Number(route.basePrice),
            governorate: route.destinationStation.governorate.name,
            governorate_ar: route.destinationStation.governorate.nameAr,
            delegation: route.destinationStation.delegation.name,
            delegation_ar: route.destinationStation.delegation.nameAr
          };
        }
        // If the searched station is the destination, return the departure station
        else {
          return {
            station_id: route.departureStation.id,
            station_name: route.departureStation.name,
            base_price: Number(route.basePrice),
            governorate: route.departureStation.governorate.name,
            governorate_ar: route.departureStation.governorate.nameAr,
            delegation: route.departureStation.delegation.name,
            delegation_ar: route.departureStation.delegation.nameAr
          };
        }
      });

      return {
        success: true,
        message: `Routes found for station: ${station.name}`,
        data: connectedStations
      };
    } catch (error: any) {
      console.error(`Error in searchRoutesByStation for station ${stationId}:`, error);
      
      // Handle database connection errors
      if (error.message?.includes('Too many database connections')) {
        throw new Error('Database connection pool exhausted. Please try again later.');
      }
      
      // Handle Prisma errors
      if (error.code === 'P2024') {
        throw new Error('Database connection timeout. Please try again.');
      }
      
      // Re-throw the original error
      throw error;
    }
  }

  /**
   * Update route prices for a specific station
   */
  async updateRoutePriceByStation(stationId: string, basePrice: number) {
    try {
      // First check if the station exists
      const station = await prisma.station.findUnique({
        where: { id: stationId }
      });

      if (!station) {
        throw new Error('Station not found');
      }

      // Update all routes where this station is either departure or destination
      const updatedRoutes = await prisma.route.updateMany({
        where: {
          OR: [
            { departureStationId: stationId },
            { destinationStationId: stationId }
          ],
          isActive: true
        },
        data: {
          basePrice: basePrice
        }
      });

      // Get the updated routes for response
      const routes = await prisma.route.findMany({
        where: {
          OR: [
            { departureStationId: stationId },
            { destinationStationId: stationId }
          ],
          isActive: true
        },
        include: {
          departureStation: true,
          destinationStation: true
        }
      });

      return {
        success: true,
        message: `Updated ${updatedRoutes.count} routes for station ${station.name}`,
        data: routes
      };
    } catch (error: any) {
      console.error(`Error in updateRoutePriceByStation for station ${stationId}:`, error);
      throw error;
    }
  }

  /**
   * Update route price between two specific stations (bidirectional)
   */
  async updateRoutePriceBetweenStations(stationId1: string, stationId2: string, basePrice: number) {
    try {
      // Check if both stations exist
      const station1 = await prisma.station.findUnique({
        where: { id: stationId1 }
      });

      const station2 = await prisma.station.findUnique({
        where: { id: stationId2 }
      });

      if (!station1 || !station2) {
        throw new Error('One or both stations not found');
      }

      // Update routes in both directions (A→B and B→A)
      const updatedRoutes = await prisma.route.updateMany({
        where: {
          OR: [
            {
              AND: [
                { departureStationId: stationId1 },
                { destinationStationId: stationId2 }
              ]
            },
            {
              AND: [
                { departureStationId: stationId2 },
                { destinationStationId: stationId1 }
              ]
            }
          ],
          isActive: true
        },
        data: {
          basePrice: basePrice
        }
      });

      // Get the updated routes for response
      const routes = await prisma.route.findMany({
        where: {
          OR: [
            {
              AND: [
                { departureStationId: stationId1 },
                { destinationStationId: stationId2 }
              ]
            },
            {
              AND: [
                { departureStationId: stationId2 },
                { destinationStationId: stationId1 }
              ]
            }
          ],
          isActive: true
        },
        include: {
          departureStation: true,
          destinationStation: true
        }
      });

      return {
        success: true,
        message: `Updated ${updatedRoutes.count} routes between ${station1.name} and ${station2.name}`,
        data: routes
      };
    } catch (error: any) {
      console.error(`Error in updateRoutePriceBetweenStations for stations ${stationId1} ↔ ${stationId2}:`, error);
      throw error;
    }
  }
} 