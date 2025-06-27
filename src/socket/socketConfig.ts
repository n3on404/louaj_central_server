import { Server as SocketIOServer } from 'socket.io';
import { Server as HTTPServer } from 'http';
import { prisma } from '../lib/database';

// Socket.IO Event Types (will be expanded as we add features)
// Using flexible typing for MVP, will enhance with strict types later
interface SocketData {
  stationId?: string;
  stationName?: string;
  authenticated: boolean;
  lastHeartbeat: Date;
  connectionType: 'local-node' | 'desktop-app' | 'mobile-app';
}

// TypeScript interface for socket data (used internally)

// Initialize Socket.IO server
export function initializeSocketIO(httpServer: HTTPServer): SocketIOServer {
  const io = new SocketIOServer(httpServer, {
    cors: {
      origin: process.env.CORS_ORIGIN || "http://localhost:3000",
      methods: ["GET", "POST"],
      credentials: true
    },
    // Connection settings optimized for our use case
    pingTimeout: 60000, // 1 minute
    pingInterval: 25000, // 25 seconds
    upgradeTimeout: 10000, // 10 seconds
    allowUpgrades: true,
    transports: ['websocket', 'polling']
  });

  // Socket.IO Middleware for authentication
  io.use(async (socket, next) => {
    console.log(`New connection attempt from ${socket.handshake.address}`);
    
    // Initialize socket data
    socket.data = {
      authenticated: false,
      lastHeartbeat: new Date(),
      connectionType: 'local-node' // Default, will be determined during auth
    } as SocketData;

    // TODO: Implement proper JWT authentication
    // const token = socket.handshake.auth.token;
    // if (token) {
    //   try {
    //     const decoded = jwt.verify(token, process.env.JWT_SECRET!);
    //     socket.data.authenticated = true;
    //     socket.data.stationId = decoded.stationId;
    //   } catch (error) {
    //     return next(new Error('Authentication failed'));
    //   }
    // }

    next();
  });

  // Connection handling
  io.on('connection', (socket) => {
    console.log(`✅ Socket connected: ${socket.id}`);

    // Send welcome message
    socket.emit('connected', {
      message: 'Connected to Louaj Central Server',
      timestamp: new Date().toISOString()
    });

    // ==================== AUTHENTICATION ====================
    socket.on('authenticate', async (data: { stationId: string; token?: string }) => {
      console.log(`Authentication attempt for station: ${data.stationId}`);
      
      try {
        // TODO: Implement proper JWT token validation
        // For now, just validate that station exists
        const station = await prisma.station.findUnique({
          where: { id: data.stationId },
          select: { id: true, name: true, isActive: true }
        });

        if (!station || !station.isActive) {
          socket.emit('authError', { message: 'Invalid station ID or station inactive' });
          return;
        }

        // Set socket data
        socket.data.authenticated = true;
        socket.data.stationId = data.stationId;
        socket.data.stationName = station.name;
        socket.data.lastHeartbeat = new Date();

        // Join station room for targeted communications
        await socket.join(`station:${data.stationId}`);
        
        // Update station status in database
        await prisma.station.update({
          where: { id: data.stationId },
          data: {
            isOnline: true,
            lastHeartbeat: new Date()
          }
        });

        // Send authentication success
        socket.emit('authenticated', {
          stationId: data.stationId,
          stationName: station.name,
          timestamp: new Date().toISOString()
        });

        // Notify other connections about station status
        socket.broadcast.emit('stationStatusUpdate', {
          stationId: data.stationId,
          isOnline: true,
          timestamp: new Date().toISOString()
        });

        console.log(`✅ Station authenticated: ${station.name} (${data.stationId})`);
        
        // TODO: Send initial sync data to newly connected station
        // await sendInitialSyncData(socket, data.stationId);
        
      } catch (error) {
        console.error('Authentication error:', error);
        socket.emit('authError', { message: 'Authentication failed' });
      }
    });

    // ==================== HEARTBEAT SYSTEM ====================
    socket.on('heartbeat', async (data: { stationId: string; timestamp: string }) => {
      if (!socket.data.authenticated || socket.data.stationId !== data.stationId) {
        socket.emit('heartbeatError', { message: 'Unauthorized heartbeat' });
        return;
      }

      socket.data.lastHeartbeat = new Date();
      
      try {
        // Update last heartbeat in database
        await prisma.station.update({
          where: { id: data.stationId },
          data: { lastHeartbeat: new Date() }
        });

        // Send heartbeat acknowledgment
        socket.emit('heartbeatAck', {
          stationId: data.stationId,
          timestamp: new Date().toISOString()
        });
        
      } catch (error) {
        console.error('Heartbeat error:', error);
        socket.emit('heartbeatError', { message: 'Heartbeat failed' });
      }
    });

    // ==================== DISCONNECTION HANDLING ====================
    socket.on('disconnect', async (reason) => {
      console.log(`❌ Socket disconnected: ${socket.id} - Reason: ${reason}`);
      
      if (socket.data.authenticated && socket.data.stationId) {
        try {
          // Mark station as offline
          await prisma.station.update({
            where: { id: socket.data.stationId },
            data: { isOnline: false }
          });

          // Notify other connections
          socket.broadcast.emit('stationStatusUpdate', {
            stationId: socket.data.stationId,
            isOnline: false,
            timestamp: new Date().toISOString()
          });

          console.log(`🔴 Station offline: ${socket.data.stationName} (${socket.data.stationId})`);
        } catch (error) {
          console.error('Disconnect cleanup error:', error);
        }
      }
    });

    // ==================== ERROR HANDLING ====================
    socket.on('error', (error) => {
      console.error(`Socket error for ${socket.id}:`, error);
    });

    // TODO: ==================== FUTURE IMPLEMENTATIONS ====================
    
    // TODO: Data Synchronization Events
    // socket.on('requestSync', async (data: { stationId: string; lastSyncTimestamp?: string }) => {
    //   // Handle sync requests from local nodes
    //   // Send incremental updates based on lastSyncTimestamp
    //   // Handle bulk data requests for initial sync
    //   // Validate station authentication before processing
    //   // Send paginated sync data to avoid memory issues
    // });

    // socket.on('pushUpdates', async (data: { stationId: string; updates: SyncUpdate[] }) => {
    //   // Handle data updates from local nodes
    //   // Validate and merge changes into central database
    //   // Broadcast updates to other relevant stations
    //   // Handle conflict detection and resolution
    //   // Log all sync operations for audit trail
    // });

    // TODO: Queue Management Events
    // socket.on('queueOperation', async (data: QueueOperationData) => {
    //   // Handle vehicle queue operations (add, remove, reorder)
    //   // Update queue positions in real-time
    //   // Broadcast queue changes to station room
    //   // Handle cross-station queue coordination
    //   // Validate queue operation permissions
    // });

    // socket.on('vehicleArrival', async (data: VehicleArrivalData) => {
    //   // Handle vehicle arrival notifications
    //   // Update vehicle queue status
    //   // Notify station staff via desktop apps
    //   // Trigger automatic queue position assignment
    // });

    // socket.on('vehicleDeparture', async (data: VehicleDepartureData) => {
    //   // Handle vehicle departure notifications
    //   // Update queue positions for remaining vehicles
    //   // Update booking statuses for departed vehicle
    //   // Broadcast queue changes to all station connections
    // });

    // TODO: Booking Management Events  
    // socket.on('bookingOperation', async (data: BookingOperationData) => {
    //   // Handle booking operations (create, update, cancel)
    //   // Update seat availability in real-time
    //   // Send booking confirmations to customers
    //   // Handle payment status updates
    //   // Validate booking against vehicle capacity
    // });

    // socket.on('ticketVerification', async (data: TicketVerificationData) => {
    //   // Handle ticket verification requests
    //   // Validate QR codes and verification codes
    //   // Update booking status to verified
    //   // Log verification events for auditing
    // });

    // TODO: Conflict Resolution Events
    // socket.on('resolveConflict', async (data: ConflictResolutionData) => {
    //   // Handle conflict resolution from local nodes
    //   // Apply conflict resolution strategies (last-write-wins, merge, manual)
    //   // Update all affected stations with resolution
    //   // Log resolution for audit trail
    //   // Send conflict resolution notifications
    // });

    // socket.on('reportConflict', async (data: ConflictReportData) => {
    //   // Handle conflict reports from local nodes
    //   // Store conflict data for manual resolution
    //   // Notify supervisors of conflicts requiring attention
    //   // Provide conflict resolution UI data
    // });

    // TODO: Real-time Notifications
    // socket.on('sendNotification', async (data: NotificationData) => {
    //   // Handle notifications between stations
    //   // Send alerts for vehicle arrivals/departures
    //   // Handle emergency broadcasts
    //   // Send system maintenance notifications
    //   // Route notifications based on recipient type
    // });

    // TODO: System Monitoring Events
    // socket.on('systemStatus', async (data: SystemStatusData) => {
    //   // Handle system status reports from local nodes
    //   // Monitor local node health and performance
    //   // Track database sync status
    //   // Generate system health dashboards
    // });
  });

  // TODO: ==================== BACKGROUND TASKS ====================
  
  // TODO: Implement heartbeat checker (detect stale connections)
  // setInterval(async () => {
  //   const staleThreshold = new Date(Date.now() - 5 * 60 * 1000); // 5 minutes
  //   
  //   const staleStations = await prisma.station.findMany({
  //     where: {
  //       isOnline: true,
  //       lastHeartbeat: { lt: staleThreshold }
  //     }
  //   });
  //   
  //   for (const station of staleStations) {
  //     await prisma.station.update({
  //       where: { id: station.id },
  //       data: { isOnline: false }
  //     });
  //     
  //     io.emit('stationStatusUpdate', {
  //       stationId: station.id,
  //       isOnline: false,
  //       timestamp: new Date().toISOString()
  //     });
  //     
  //     console.log(`🔴 Station marked offline due to stale heartbeat: ${station.name}`);
  //   }
  // }, 60000); // Check every minute

  // TODO: Implement sync coordinator (manage data synchronization)
  // setInterval(async () => {
  //   // Check for pending sync operations
  //   const pendingSyncs = await prisma.syncLog.findMany({
  //     where: { syncStatus: 'PENDING' },
  //     orderBy: { createdAt: 'asc' },
  //     take: 100
  //   });
  //   
  //   for (const sync of pendingSyncs) {
  //     try {
  //       // Retry failed syncs
  //       await processSyncOperation(sync);
  //     } catch (error) {
  //       // Update retry count and error message
  //       await prisma.syncLog.update({
  //         where: { id: sync.id },
  //         data: {
  //           retryCount: { increment: 1 },
  //           error: error.message
  //         }
  //       });
  //     }
  //   }
  //   
  //   // Clean up old sync logs (older than 30 days)
  //   const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  //   await prisma.syncLog.deleteMany({
  //     where: {
  //       createdAt: { lt: thirtyDaysAgo },
  //       syncStatus: 'SYNCED'
  //     }
  //   });
  // }, 30000); // Check every 30 seconds

  console.log('🚀 Socket.IO server initialized');
  console.log('📡 Waiting for local node connections...');
  console.log('🔗 Available events: authenticate, heartbeat, disconnect');
  
  return io;
}

// TODO: ==================== UTILITY FUNCTIONS (Future Implementation) ====================

// TODO: Implement initial sync data sender
// async function sendInitialSyncData(socket: Socket, stationId: string) {
//   try {
//     // Get all data needed for initial sync
//     const syncData = await prisma.station.findUnique({
//       where: { id: stationId },
//       include: {
//         staff: { where: { isActive: true } },
//         queueEntries: {
//           where: { status: { in: ['WAITING', 'LOADING', 'READY'] } },
//           include: {
//             vehicle: { include: { driver: true } },
//             bookings: {
//               where: { 
//                 createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } // Last 24 hours
//               }
//             }
//           }
//         },
//         bookings: {
//           where: { 
//             createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
//             isVerified: false
//           }
//         }
//       }
//     });
//     
//     // Send initial sync data in chunks to avoid memory issues
//     socket.emit('initialSync', { 
//       data: syncData, 
//       timestamp: new Date().toISOString(),
//       checksum: generateDataChecksum(syncData) // For integrity verification
//     });
//     
//     console.log(`📤 Initial sync data sent to station: ${stationId}`);
//   } catch (error) {
//     console.error('Initial sync error:', error);
//     socket.emit('syncError', { message: 'Initial sync failed' });
//   }
// }

// TODO: Implement conflict resolution utilities
// export enum ConflictResolutionStrategy {
//   LAST_WRITE_WINS = 'last_write_wins',
//   CENTRAL_AUTHORITY = 'central_authority',
//   MERGE_STRATEGY = 'merge_strategy',
//   MANUAL_RESOLUTION = 'manual_resolution'
// }

// export function resolveConflict(
//   centralData: any, 
//   localData: any, 
//   conflictType: string,
//   strategy: ConflictResolutionStrategy = ConflictResolutionStrategy.CENTRAL_AUTHORITY
// ) {
//   switch (strategy) {
//     case ConflictResolutionStrategy.LAST_WRITE_WINS:
//       return localData.updatedAt > centralData.updatedAt ? localData : centralData;
//     case ConflictResolutionStrategy.CENTRAL_AUTHORITY:
//       return centralData; // Central server always wins
//     case ConflictResolutionStrategy.MERGE_STRATEGY:
//       return mergeDataObjects(centralData, localData);
//     case ConflictResolutionStrategy.MANUAL_RESOLUTION:
//       // Store conflict for manual resolution
//       return { requiresManualResolution: true, centralData, localData };
//     default:
//       return centralData;
//   }
// }

// TODO: Implement room management utilities
// export function joinStationRoom(socket: Socket, stationId: string) {
//   socket.join(`station:${stationId}`);
//   console.log(`Socket ${socket.id} joined station room: ${stationId}`);
// }

// export function broadcastToStation(io: SocketIOServer, stationId: string, event: string, data: any) {
//   io.to(`station:${stationId}`).emit(event, data);
//   console.log(`Broadcasted ${event} to station: ${stationId}`);
// }

// export function broadcastToAllStations(io: SocketIOServer, event: string, data: any) {
//   io.emit(event, data);
//   console.log(`Broadcasted ${event} to all connected stations`);
// }

// TODO: Implement data integrity utilities
// function generateDataChecksum(data: any): string {
//   const crypto = require('crypto');
//   return crypto.createHash('md5').update(JSON.stringify(data)).digest('hex');
// }

// TODO: Data Types for Future Implementation
// interface SyncUpdate {
//   tableName: string;
//   recordId: string;
//   operation: 'INSERT' | 'UPDATE' | 'DELETE';
//   data: any;
//   timestamp: string;
//   checksum: string;
// }

// interface QueueOperationData {
//   stationId: string;
//   vehicleId: string;
//   operation: 'ADD' | 'REMOVE' | 'REORDER' | 'UPDATE_STATUS';
//   queuePosition?: number;
//   destinationId: string;
//   timestamp: string;
// }

// interface BookingOperationData {
//   stationId: string;
//   bookingId: string;
//   operation: 'CREATE' | 'UPDATE' | 'CANCEL' | 'VERIFY';
//   bookingData?: any;
//   timestamp: string;
// } 