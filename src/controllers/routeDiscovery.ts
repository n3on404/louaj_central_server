import { Request, Response } from 'express';
import { prisma } from '../config/database';
import axios from 'axios';
import { CentralWebSocketServer } from '../websocket/WebSocketServer';

// Define interfaces for type safety
interface LocalNodeResponse {
  success: boolean;
  data?: any;
  error?: string;
}

/**
 * Broadcast real-time route discovery updates to mobile apps
 */
function broadcastRouteDiscoveryUpdate(type: string, data: any) {
  const wsServer = CentralWebSocketServer.getInstance();
  if (wsServer) {
    wsServer.broadcastToMobileApps({
      type: 'data_update',
      payload: {
        category: 'route_discovery',
        updateType: type,
        data,
        timestamp: new Date().toISOString()
      },
      timestamp: Date.now()
    });
    
    console.log(`📡 Broadcasted route discovery ${type} update to mobile apps`);
  }
}

/**
 * Public Route Discovery Controller
 * Handles route discovery and real-time queue information
 */
export class RouteDiscoveryController {

  /**
   * GET /api/v1/route-discovery/stations/online
   * Get all online stations that have available destinations
   */
  async getOnlineStationsWithDestinations(_req: Request, res: Response): Promise<void> {
    try {
      console.log('🔍 Discovering online stations with available destinations');

      // Get all active stations from database
      const activeStations = await prisma.station.findMany({
        where: {
          isOnline: true,
        },
        select: {
          id: true,
          name: true,
          nameAr: true,
          localServerIp: true,
          isOnline: true,
          lastHeartbeat: true,
          governorate: {
            select: { name: true, nameAr: true }
          },
          delegation: {
            select: { name: true, nameAr: true }
          }
        }
      });

      if (activeStations.length === 0) {
        res.json({
          success: true,
          data: {
            stations: [],
            totalStations: 0,
            onlineStations: 0,
            message: 'No active stations found'
          }
        });
        return;
      }

      // Check each station's availability and get destination data
      const stationPromises = activeStations.map(async (station) => {
        try {
          if (!station.localServerIp) {
            return null;
          }

          const localNodeUrl = `http://${station.localServerIp}:3001/api/public/destinations`;
          
          // Set a short timeout for quick response
          const response = await axios.get(localNodeUrl, {
            timeout: 5000,
            headers: {
              'Content-Type': 'application/json',
              'User-Agent': 'Louaj-Central-Server/1.0'
            }
          });

          const responseData = response.data as LocalNodeResponse;
          if (responseData.success && responseData.data?.destinations?.length > 0) {
            return {
              stationId: station.id,
              stationName: station.name,
              stationNameAr: station.nameAr,
              governorate: station.governorate.name,
              governorateAr: station.governorate.nameAr,
              delegation: station.delegation.name,
              delegationAr: station.delegation.nameAr,
              isOnline: true,
              lastChecked: new Date().toISOString(),
              
              // Destination summary
              destinationCount: responseData.data.destinations.length,
              totalAvailableSeats: responseData.data.destinations.reduce(
                (sum: number, dest: any) => sum + dest.totalAvailableSeats, 0
              ),
              destinations: responseData.data.destinations.map((dest: any) => ({
                destinationId: dest.destinationId,
                destinationName: dest.destinationName,
                availableSeats: dest.totalAvailableSeats,
                vehicleCount: dest.vehicleCount
              }))
            };
          }

          return null;

        } catch (error) {
          console.warn(`⚠️ Station ${station.name} (${station.localServerIp}) is not responding:`, 
            error instanceof Error ? error.message : 'Unknown error');
          return null;
        }
      });

      // Wait for all station checks to complete
      const stationResults = await Promise.all(stationPromises);
      const onlineStations = stationResults.filter(station => station !== null);

      res.json({
        success: true,
        data: {
          stations: onlineStations,
          totalStations: activeStations.length,
          onlineStations: onlineStations.length,
          offlineStations: activeStations.length - onlineStations.length,
          lastUpdate: new Date().toISOString()
        }
      });

      // Broadcast real-time update to mobile apps
      broadcastRouteDiscoveryUpdate('stations_online', {
        onlineStations: onlineStations.length,
        totalStations: activeStations.length,
        stationsSummary: onlineStations.map(s => ({
          stationId: s.stationId,
          stationName: s.stationName,
          destinationCount: s.destinationCount,
          totalAvailableSeats: s.totalAvailableSeats
        }))
      });

    } catch (error) {
      console.error('❌ Error discovering online stations:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to discover online stations',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * GET /api/v1/route-discovery/stations/:stationId
   * Get available destinations for a specific station
   */
  async getStationDestinations(req: Request, res: Response): Promise<void> {
    try {
      const { stationId } = req.params;

      if (!stationId) {
        res.status(400).json({
          success: false,
          error: 'Station ID is required'
        });
        return;
      }

      console.log(`🔍 Getting destinations for station: ${stationId}`);

      // Get station info from database
      const station = await prisma.station.findUnique({
        where: { id: stationId },
        select: {
          id: true,
          name: true,
          nameAr: true,
          localServerIp: true,
          isActive: true,
          isOnline: true,
          governorate: { select: { name: true, nameAr: true } },
          delegation: { select: { name: true, nameAr: true } }
        }
      });

      if (!station) {
        res.status(404).json({
          success: false,
          error: 'Station not found'
        });
        return;
      }

      if (!station.isActive) {
        res.status(400).json({
          success: false,
          error: 'Station is not active'
        });
        return;
      }

      if (!station.localServerIp) {
        res.status(400).json({
          success: false,
          error: 'Station has no local server configured'
        });
        return;
      }

      // Query the local node for available destinations
      const localNodeUrl = `http://${station.localServerIp}:3001/api/public/destinations`;
      
      try {
        const response = await axios.get(localNodeUrl, {
          timeout: 8000,
          headers: {
            'Content-Type': 'application/json',
            'User-Agent': 'Louaj-Central-Server/1.0'
          }
        });

        const responseData = response.data as LocalNodeResponse;
        if (!responseData.success) {
          res.status(400).json({
            success: false,
            error: 'Failed to get destinations from local station',
            details: responseData.error || 'Unknown error'
          });
          return;
        }

        res.json({
          success: true,
          data: {
            // Station information
            station: {
              id: station.id,
              name: station.name,
              nameAr: station.nameAr,
              governorate: station.governorate.name,
              governorateAr: station.governorate.nameAr,
              delegation: station.delegation.name,
              delegationAr: station.delegation.nameAr,
              isOnline: station.isOnline
            },

            // Destinations from local node
            destinations: responseData.data.destinations || [],
            totalDestinations: responseData.data.destinations?.length || 0,
            totalAvailableSeats: responseData.data.destinations?.reduce(
              (sum: number, dest: any) => sum + (dest.totalAvailableSeats || 0), 0
            ) || 0,

            // Meta information
            meta: {
              isRealTime: true,
              dataSource: 'local_node',
              lastUpdate: responseData.data.lastUpdate || new Date().toISOString(),
              responseTime: new Date().toISOString()
            }
          }
        });

        // Broadcast real-time update to mobile apps
        broadcastRouteDiscoveryUpdate('station_destinations', {
          stationId: station.id,
          stationName: station.name,
          destinationCount: responseData.data.destinations?.length || 0,
          totalAvailableSeats: responseData.data.destinations?.reduce(
            (sum: number, dest: any) => sum + (dest.totalAvailableSeats || 0), 0
          ) || 0,
          destinations: responseData.data.destinations || []
        });

      } catch (localNodeError) {
        console.error(`❌ Error communicating with local node ${station.localServerIp}:`, localNodeError);
        
        res.status(503).json({
          success: false,
          error: 'Local station is not responding',
          details: 'The station server is currently unavailable',
          stationInfo: {
            id: station.id,
            name: station.name,
            status: 'offline'
          }
        });
      }

    } catch (error) {
      console.error('❌ Error getting station destinations:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get station destinations',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * GET /api/v1/route-discovery/route/:departureStationId/:destinationId
   * Get detailed vehicle queue information for a specific route
   */
  async getRouteDetails(req: Request, res: Response): Promise<void> {
    try {
      const { departureStationId, destinationId } = req.params;

      if (!departureStationId || !destinationId) {
        res.status(400).json({
          success: false,
          error: 'Both departure station ID and destination ID are required'
        });
        return;
      }

      console.log(`🚍 Getting route details: ${departureStationId} → ${destinationId}`);

      // Get departure station info
      const departureStation = await prisma.station.findUnique({
        where: { id: departureStationId },
        select: {
          id: true,
          name: true,
          nameAr: true,
          localServerIp: true,
          isActive: true,
          governorate: { select: { name: true, nameAr: true } },
          delegation: { select: { name: true, nameAr: true } }
        }
      });

      if (!departureStation) {
        res.status(404).json({
          success: false,
          error: 'Departure station not found'
        });
        return;
      }

      if (!departureStation.isActive || !departureStation.localServerIp) {
        res.status(400).json({
          success: false,
          error: 'Departure station is not active or has no local server'
        });
        return;
      }

      // Get destination station info (for display purposes)
      const destinationStation = await prisma.station.findUnique({
        where: { id: destinationId },
        select: {
          id: true,
          name: true,
          nameAr: true,
          governorate: { select: { name: true, nameAr: true } },
          delegation: { select: { name: true, nameAr: true } }
        }
      });

      // Query the local node for queue details
      const localNodeUrl = `http://${departureStation.localServerIp}:3001/api/public/queue/${destinationId}`;
      
      try {
        const response = await axios.get(localNodeUrl, {
          timeout: 10000,
          headers: {
            'Content-Type': 'application/json',
            'User-Agent': 'Louaj-Central-Server/1.0'
          }
        });

        const responseData = response.data as LocalNodeResponse;
        if (!responseData.success) {
          res.status(400).json({
            success: false,
            error: 'Failed to get queue information from local station',
            details: responseData.error || 'Unknown error'
          });
          return;
        }

        // Enhance the response with additional station info
        const queueData = responseData.data;
        
        res.json({
          success: true,
          data: {
            // Route information
            route: {
              departureStation: {
                id: departureStation.id,
                name: departureStation.name,
                nameAr: departureStation.nameAr,
                governorate: departureStation.governorate.name,
                governorateAr: departureStation.governorate.nameAr,
                delegation: departureStation.delegation.name,
                delegationAr: departureStation.delegation.nameAr
              },
              destinationStation: destinationStation ? {
                id: destinationStation.id,
                name: destinationStation.name,
                nameAr: destinationStation.nameAr,
                governorate: destinationStation.governorate.name,
                governorateAr: destinationStation.governorate.nameAr,
                delegation: destinationStation.delegation.name,
                delegationAr: destinationStation.delegation.nameAr
              } : {
                id: destinationId,
                name: queueData.destinationName || 'Unknown Destination'
              }
            },

            // Queue data from local node
            queue: {
              vehicles: queueData.vehicles,
              totalVehicles: queueData.totalVehicles,
              totalAvailableSeats: queueData.totalAvailableSeats,
              queueStats: queueData.queueStats,
              priceRange: queueData.priceRange
            },

            // Meta information
            meta: {
              isRealTime: true,
              dataSource: 'local_node',
              lastUpdate: queueData.lastUpdate,
              responseTime: new Date().toISOString()
            }
          }
        });

        // Broadcast real-time route details update to mobile apps
        broadcastRouteDiscoveryUpdate('route_details', {
          departureStationId: departureStation.id,
          departureStationName: departureStation.name,
          destinationId: destinationId,
          destinationName: destinationStation?.name || queueData.destinationName,
          totalVehicles: queueData.totalVehicles,
          totalAvailableSeats: queueData.totalAvailableSeats,
          queueStats: queueData.queueStats,
          priceRange: queueData.priceRange
        });

      } catch (localNodeError) {
        console.error(`❌ Error communicating with local node ${departureStation.localServerIp}:`, localNodeError);
        
        res.status(503).json({
          success: false,
          error: 'Local station is not responding',
          details: 'The departure station server is currently unavailable',
          stationInfo: {
            id: departureStation.id,
            name: departureStation.name,
            status: 'offline'
          }
        });
      }

    } catch (error) {
      console.error('❌ Error getting route details:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get route details',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * GET /api/v1/route-discovery/station/:stationId/status
   * Get detailed status of a specific station
   */
  async getStationStatus(req: Request, res: Response): Promise<void> {
    try {
      const { stationId } = req.params;

      const station = await prisma.station.findUnique({
        where: { id: stationId },
        select: {
          id: true,
          name: true,
          nameAr: true,
          localServerIp: true,
          isActive: true,
          isOnline: true,
          lastHeartbeat: true,
          governorate: { select: { name: true, nameAr: true } },
          delegation: { select: { name: true, nameAr: true } }
        }
      });

      if (!station) {
        res.status(404).json({
          success: false,
          error: 'Station not found'
        });
        return;
      }

      let localNodeStatus = null;
      
      if (station.localServerIp) {
        try {
          const localNodeUrl = `http://${station.localServerIp}:3001/api/public/station/status`;
          const response = await axios.get(localNodeUrl, { timeout: 3000 });
          
          const responseData = response.data as LocalNodeResponse;
          if (responseData.success) {
            localNodeStatus = responseData.data;
          }
        } catch (error) {
          console.warn(`⚠️ Could not reach local node for station ${station.name}`);
        }
      }

      res.json({
        success: true,
        data: {
          station: {
            id: station.id,
            name: station.name,
            nameAr: station.nameAr,
            governorate: station.governorate.name,
            governorateAr: station.governorate.nameAr,
            delegation: station.delegation.name,
            delegationAr: station.delegation.nameAr,
            isActive: station.isActive,
            isOnline: station.isOnline,
            lastHeartbeat: station.lastHeartbeat?.toISOString(),
            hasLocalServer: !!station.localServerIp
          },
          localNodeStatus,
          isResponding: !!localNodeStatus,
          lastChecked: new Date().toISOString()
        }
      });

    } catch (error) {
      console.error('❌ Error getting station status:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get station status',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }
}

export const routeDiscoveryController = new RouteDiscoveryController();
