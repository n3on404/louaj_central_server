import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function verifyCompleteData() {
  console.log('🔍 Verifying complete Monastir data...\n');

  try {
    // Check governorate
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

    if (monastir) {
      console.log('✅ Monastir Governorate found:');
      console.log(`   - ID: ${monastir.id}`);
      console.log(`   - Name: ${monastir.name}`);
      console.log(`   - Name (Arabic): ${monastir.nameAr}`);
      console.log(`   - Created: ${monastir.createdAt}`);
      console.log(`   - Number of delegations: ${monastir.delegations.length}`);
      console.log(`   - Number of stations: ${monastir.stations.length}\n`);

      console.log('📋 Delegations and their Stations:');
      monastir.delegations.forEach((delegation, index) => {
        console.log(`   ${index + 1}. ${delegation.name} (${delegation.nameAr})`);
        if (delegation.stations.length > 0) {
          delegation.stations.forEach(station => {
            console.log(`      🏢 Station: ${station.name} (${station.nameAr})`);
            console.log(`         - ID: ${station.id}`);
            console.log(`         - Address: ${station.address || 'N/A'}`);
            console.log(`         - Coordinates: ${station.latitude}, ${station.longitude}`);
            console.log(`         - Active: ${station.isActive}, Online: ${station.isOnline}`);
          });
        } else {
          console.log(`      ❌ No station found for this delegation`);
        }
        console.log('');
      });

      // Check for any delegations without stations
      const delegationsWithoutStations = monastir.delegations.filter(d => d.stations.length === 0);
      if (delegationsWithoutStations.length > 0) {
        console.log('⚠️  Delegations without stations:');
        delegationsWithoutStations.forEach(d => {
          console.log(`   - ${d.name}`);
        });
      }

    } else {
      console.log('❌ Monastir governorate not found!');
    }

  } catch (error) {
    console.error('❌ Error verifying data:', error);
  } finally {
    await prisma.$disconnect();
  }
}

verifyCompleteData();