import express, { Application, Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import dotenv from 'dotenv';
import { createServer } from 'http';
import { CentralWebSocketServer } from './websocket/WebSocketServer';
import { testDatabaseConnection, disconnectDatabase } from './config/database';
import { routeDiscoveryService } from './services/routeDiscovery';
import { instantSyncService } from './services/instantSyncService';

// Load environment variables
dotenv.config();

// Create Express app and HTTP server
const app: Application = express();
const httpServer = createServer(app);
const PORT = process.env.PORT || 5000;

// Initialize WebSocket Server
const wsServer = new CentralWebSocketServer(httpServer);

// Middleware
app.use(helmet()); // Security headers
app.use(cors({
  origin: true,
  credentials: true
}));
app.use(morgan('combined')); // Logging
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Health check endpoint
app.get('/health', async (_req: Request, res: Response) => {
  try {
    // Test database connection
    const isConnected = await testDatabaseConnection();
    if (isConnected) {
      res.status(200).json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        service: 'Louaj Central Server',
        database: 'connected'
      });
    } else {
      res.status(503).json({
        status: 'unhealthy',
        timestamp: new Date().toISOString(),
        service: 'Louaj Central Server',
        database: 'disconnected',
        error: 'Database connection failed'
      });
    }
  } catch (error) {
    res.status(503).json({
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      service: 'Louaj Central Server',
      database: 'disconnected',
      error: 'Database connection failed'
    });
  }
});

// API Routes
app.get('/api/v1', (_req: Request, res: Response) => {
  res.json({
    message: 'Welcome to Louaj Central Server API',
    version: '1.0.0',
    documentation: '/api/v1/docs',
    websocket: {
      endpoint: `ws://localhost:${PORT}/ws`,
      events: ['authenticate', 'heartbeat', 'connection_test', 'sync_request', 'data_update'],
      status: 'active'
    },
    endpoints: {
      health: '/health',
      socketStatus: '/api/v1/socket/status',
      auth: '/api/v1/auth',
      stations: '/api/v1/stations',
      vehicles: '/api/v1/vehicles',
      bookings: '/api/v1/bookings',
      queue: '/api/v1/queue',
      users: '/api/v1/users',
      routes: '/api/v1/routes',
      routeDiscovery: '/api/v1/route-discovery'

    }
  });
});

// WebSocket status endpoint
app.get('/api/v1/socket/status', async (_req: Request, res: Response) => {
  try {
    const connectedClients = wsServer.getClientCount();
    const authenticatedStations = wsServer.getAuthenticatedStations();
    const stationStatusFromDB = await wsServer.getStationStatus();

    res.json({
      status: 'active',
      connectedClients,
      authenticatedStations: authenticatedStations.length,
      webSocketClients: authenticatedStations.map(station => ({
        clientId: station.id,
        stationId: station.stationId,
        stationName: station.stationName,
        ipAddress: station.ipAddress,
        connectionType: station.connectionType,
        lastHeartbeat: station.lastHeartbeat.toISOString(),
        connected: true
      })),
      databaseStatus: stationStatusFromDB.map((station: any) => ({
        stationId: station.id,
        stationName: station.name,
        isActive: station.isActive,
        isOnline: station.isOnline,
        lastHeartbeat: station.lastHeartbeat?.toISOString() || null,
        lastHeartbeatAge: station.lastHeartbeatAge,
        connectedClients: station.connectedClients
      })),
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('❌ Error getting WebSocket status:', error);
    res.status(500).json({
      error: 'Failed to get WebSocket status',
      message: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString()
    });
  }
});

// Import routes
import authRoutes from './routes/auth';
import stationRoutes from './routes/stations';
import vehicleRoutes from './routes/vehicle';
import queueRoutes from './routes/queue';
import userRoutes from './routes/user';
import bookingRoutes from './routes/booking';
import centralBookingRoutes from './routes/centralBooking';
import tripRoutes from './routes/trip';
import staffRoutes from './routes/staff';
import routeRoutes from './routes/route';
import routeDiscoveryRoutes from './routes/routeDiscovery';
// Use routes
app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/stations', stationRoutes);
app.use('/api/v1/vehicles', vehicleRoutes);
app.use('/api/v1/queue', queueRoutes);
app.use('/api/v1/users', userRoutes);
app.use('/api/v1/bookings', bookingRoutes);
app.use('/api/v1/central-bookings', centralBookingRoutes);
app.use('/api/v1/trips', tripRoutes);
app.use('/api/v1/staff', staffRoutes);
app.use('/api/v1/routes', routeRoutes);
app.use('/api/v1/route-discovery', routeDiscoveryRoutes);

// Error handling middleware
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error('Error:', err.stack);
  res.status(500).json({
    error: 'Internal Server Error',
    message: process.env.NODE_ENV === 'development' ? err.message : 'Something went wrong',
    timestamp: new Date().toISOString()
  });
});

// 404 handler
app.use((req: Request, res: Response) => {
  res.status(404).json({
    error: 'Route not found',
    message: `The route ${req.originalUrl} does not exist`,
    timestamp: new Date().toISOString()
  });
});

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('\nReceived SIGINT. Graceful shutdown...');
  try {
    routeDiscoveryService.stop();
    await wsServer.close();
    await disconnectDatabase();
    console.log('✅ Graceful shutdown completed');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error during graceful shutdown:', error);
    process.exit(1);
  }
});

process.on('SIGTERM', async () => {
  console.log('\nReceived SIGTERM. Graceful shutdown...');
  try {
    routeDiscoveryService.stop();
    await wsServer.close();
    await disconnectDatabase();
    console.log('✅ Graceful shutdown completed');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error during graceful shutdown:', error);
    process.exit(1);
  }
});

// Start server
httpServer.listen(PORT, () => {
  console.log(`Louaj Central Server is running on port ${PORT}`);
  console.log(`Health check: http://localhost:${PORT}/health`);
  console.log(`API Documentation: http://localhost:${PORT}/api/v1`);
  console.log(`WebSocket endpoint: ws://localhost:${PORT}/ws`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
  
  // Initialize instant sync service with WebSocket server
  instantSyncService.setWebSocketServer(wsServer);
  console.log('✅ Instant sync service initialized');
  
  // Setup route discovery service events
  routeDiscoveryService.on('station_online', (station) => {
    console.log(`🟢 Station ${station.stationName} is now online`);
    
    // Broadcast to mobile apps that a new station is available
    wsServer.broadcastToMobileApps({
      type: 'station_status_update',
      payload: {
        stationId: station.stationId,
        stationName: station.stationName,
        status: 'online',
        timestamp: new Date().toISOString()
      },
      timestamp: Date.now()
    });
  });
  
  routeDiscoveryService.on('station_offline', (station) => {
    console.log(`🔴 Station ${station.stationName} is now offline`);
    
    // Broadcast to mobile apps that a station is no longer available
    wsServer.broadcastToMobileApps({
      type: 'station_status_update',
      payload: {
        stationId: station.stationId,
        stationName: station.stationName,
        status: 'offline',
        timestamp: new Date().toISOString()
      },
      timestamp: Date.now()
    });
  });
});

export default app; 