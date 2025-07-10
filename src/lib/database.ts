import { PrismaClient } from '@prisma/client';

// Extend the global namespace to include prisma
declare global {
  var __prisma: PrismaClient | undefined;
}

// PrismaClient is attached to the global object in development to prevent exhausting database connection
// limit during development due to hot reloading. In production, it's initialized once.
const prisma =
  globalThis.__prisma ||
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
    datasources: {
      db: {
        url: process.env.DATABASE_URL || '',
      },
    },
  });

if (process.env.NODE_ENV === 'development') {
  globalThis.__prisma = prisma;
}

export { prisma };

// Database connection test utility
export async function testDatabaseConnection(): Promise<boolean> {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return true;
  } catch (error) {
    console.error('Database connection failed:', error);
    return false;
  }
}

// Graceful shutdown utility
export async function disconnectDatabase(): Promise<void> {
  await prisma.$disconnect();
}

// Connection pool monitoring
export async function getConnectionInfo(): Promise<{ activeConnections: number; idleConnections: number }> {
  try {
    // This is a simplified version - in production you might want to use database-specific queries
    const result = await prisma.$queryRaw`SELECT count(*) as active_connections FROM pg_stat_activity WHERE state = 'active'`;
    return {
      activeConnections: Number((result as any)[0]?.active_connections || 0),
      idleConnections: 0, // This would need a more specific query for PostgreSQL
    };
  } catch (error) {
    console.error('Error getting connection info:', error);
    return { activeConnections: 0, idleConnections: 0 };
  }
} 