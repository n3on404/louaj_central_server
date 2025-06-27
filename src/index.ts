import express, { Application, Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import dotenv from 'dotenv';
import { createServer } from 'http';
import { PrismaClient } from '@prisma/client';
import { initializeSocketIO } from './socket/socketConfig';

// Load environment variables
dotenv.config();

// Initialize Prisma Client
const prisma = new PrismaClient();

// Create Express app and HTTP server
const app: Application = express();
const httpServer = createServer(app);
const PORT = process.env.PORT || 5000;

// Initialize Socket.IO
const io = initializeSocketIO(httpServer);

// Middleware
app.use(helmet()); // Security headers
app.use(cors({
  origin: process.env.CORS_ORIGIN || 'http://localhost:3000',
  credentials: true
}));
app.use(morgan('combined')); // Logging
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Health check endpoint
app.get('/health', async (_req: Request, res: Response) => {
  try {
    // Test database connection
    await prisma.$queryRaw`SELECT 1`;
    res.status(200).json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      service: 'Louaj Central Server',
      database: 'connected'
    });
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
    socketIO: {
      endpoint: `ws://localhost:${PORT}`,
      events: ['authenticate', 'heartbeat', 'stationStatusUpdate'],
      status: 'active'
    },
    endpoints: {
      health: '/health',
      socketStatus: '/api/v1/socket/status',
      auth: '/api/v1/auth',
      stations: '/api/v1/stations',
      vehicles: '/api/v1/vehicles',
      bookings: '/api/v1/bookings',
      queue: '/api/v1/queue'
    }
  });
});

// Socket.IO status endpoint
app.get('/api/v1/socket/status', (_req: Request, res: Response) => {
  const connectedSockets = io.engine.clientsCount;
  const rooms = Array.from(io.sockets.adapter.rooms.keys()).filter(room => room.startsWith('station:'));
  
  res.json({
    status: 'active',
    connectedClients: connectedSockets,
    activeStationRooms: rooms.length,
    stationRooms: rooms,
    timestamp: new Date().toISOString()
  });
});

// Import routes
import authRoutes from './routes/auth';
import stationRoutes from './routes/stations';
import vehicleRoutes from './routes/vehicle';
import queueRoutes from './routes/queue';
// import bookingRoutes from './routes/bookings';

// Use routes
app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/stations', stationRoutes);
app.use('/api/v1/vehicles', vehicleRoutes);
app.use('/api/v1/queue', queueRoutes);
// app.use('/api/v1/bookings', bookingRoutes);

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
  await prisma.$disconnect();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('\nReceived SIGTERM. Graceful shutdown...');
  await prisma.$disconnect();
  process.exit(0);
});

// Start server
httpServer.listen(PORT, () => {
  console.log(`Louaj Central Server is running on port ${PORT}`);
  console.log(`Health check: http://localhost:${PORT}/health`);
  console.log(`API Documentation: http://localhost:${PORT}/api/v1`);
  console.log(`Socket.IO endpoint: ws://localhost:${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
});

export default app; 