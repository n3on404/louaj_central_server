import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function cleanMonastirData() {
  console.log('🧹 Cleaning existing Monastir data...\n');

  try {
    // Find Monastir governorate
    const monastir = await prisma.governorate.findUnique({
      where: { name: 'MONASTIR' },
      include: {
        delegations: {
          include: {
            stations: true
          }
        },
        stations: true
      }
    });

    if (!monastir) {
      console.log('ℹ️  No Monastir data found to clean.');
      return;
    }

    console.log(`Found Monastir data:`);
    console.log(`   - Delegations: ${monastir.delegations.length}`);
    console.log(`   - Stations: ${monastir.stations.length}\n`);

    // Delete stations first (due to foreign key constraints)
    if (monastir.stations.length > 0) {
      await prisma.station.deleteMany({
        where: { governorateId: monastir.id }
      });
      console.log(`✅ Deleted ${monastir.stations.length} stations`);
    }

    // Delete delegations
    if (monastir.delegations.length > 0) {
      await prisma.delegation.deleteMany({
        where: { governorateId: monastir.id }
      });
      console.log(`✅ Deleted ${monastir.delegations.length} delegations`);
    }

    // Delete governorate
    await prisma.governorate.delete({
      where: { id: monastir.id }
    });
    console.log(`✅ Deleted Monastir governorate`);

    console.log('\n🎉 Monastir data cleaned successfully!');

  } catch (error) {
    console.error('❌ Error cleaning data:', error);
  } finally {
    await prisma.$disconnect();
  }
}

cleanMonastirData();