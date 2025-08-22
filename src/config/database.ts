import { PrismaClient } from '@prisma/client';

// Database URL from environment or fallback
const DATABASE_URL = process.env.DATABASE_URL || "postgresql://ivan:Lost2409@localhost:5432/louaj_main";

// Initialize Prisma Client with explicit database URL
const prisma = new PrismaClient({
  datasources: {
    db: {
      url: DATABASE_URL,
    },
  },
  log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
});

// Test database connection
export const testDatabaseConnection = async (): Promise<boolean> => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    console.log('✅ Central server database connection successful');
    return true;
  } catch (error) {
    console.error('❌ Central server database connection failed:', error);
    return false;
  }
};

// Graceful shutdown
export const disconnectDatabase = async (): Promise<void> => {
  await prisma.$disconnect();
};

export { prisma }; 