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