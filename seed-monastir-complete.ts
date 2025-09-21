import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Starting complete Monastir seeding (Governorate + Delegations + Stations)...');

  // Create Monastir Governorate
  const monastir = await prisma.governorate.upsert({
    where: { name: 'MONASTIR' },
    update: {},
    create: {
      name: 'MONASTIR',
      nameAr: 'المنستير'
    }
  });

  console.log('✅ Created/Updated Monastir governorate');

  // Delegation data with coordinates
  const delegationsData = [
    {
      name: 'MONASTIR',
      nameAr: 'المنستير',
      postalCode: '5000',
      latitude: 35.7644,
      longitude: 10.8
    },
    {
      name: 'SAHLINE',
      nameAr: 'الساحلين',
      postalCode: '5012',
      latitude: 35.7197,
      longitude: 10.7594
    },
    {
      name: 'KSIBET EL MEDIOUNI',
      nameAr: 'قصيبة المديوني',
      postalCode: '5031',
      latitude: 35.6667,
      longitude: 10.8167
    },
    {
      name: 'JEMMAL',
      nameAr: 'جمال',
      postalCode: '5020',
      latitude: 35.6,
      longitude: 10.75
    },
    {
      name: 'BENI HASSEN',
      nameAr: 'بني حسان',
      postalCode: '5014',
      latitude: 35.5167,
      longitude: 10.75
    },
    {
      name: 'SAYADA LAMTA BOU HAJAR',
      nameAr: 'صيادة لمطة بوحجر',
      postalCode: '5035',
      latitude: 35.6719,
      longitude: 10.8725
    },
    {
      name: 'TEBOULBA',
      nameAr: 'طبلبة',
      postalCode: '5080',
      latitude: 35.6425,
      longitude: 10.9614
    },
    {
      name: 'KSAR HELAL',
      nameAr: 'قصر هلال',
      postalCode: '5070',
      latitude: 35.6439,
      longitude: 10.8906
    },
    {
      name: 'BEMBLA',
      nameAr: 'بمبلة',
      postalCode: '5021',
      latitude: 35.7,
      longitude: 10.8
    },
    {
      name: 'MOKNINE',
      nameAr: 'المكنين',
      postalCode: '5034',
      latitude: 35.6311,
      longitude: 10.9011
    },
    {
      name: 'ZERAMDINE',
      nameAr: 'زرمدين',
      postalCode: '5040',
      latitude: 35.5803,
      longitude: 10.7806
    },
    {
      name: 'OUERDANINE',
      nameAr: 'الوردانين',
      postalCode: '5010',
      latitude: 35.6764,
      longitude: 10.7281
    },
    {
      name: 'BEKALTA',
      nameAr: 'البقالطة',
      postalCode: '5090',
      latitude: 35.6167,
      longitude: 11.0333
    }
  ];

  // Create Delegations and Stations
  for (const delegationData of delegationsData) {
    // Check if delegation already exists
    let delegation = await prisma.delegation.findFirst({
      where: {
        name: delegationData.name,
        governorateId: monastir.id
      }
    });

    if (!delegation) {
      delegation = await prisma.delegation.create({
        data: {
          name: delegationData.name,
          nameAr: delegationData.nameAr,
          governorateId: monastir.id
        }
      });
      console.log(`✅ Created delegation: ${delegationData.name}`);
    } else {
      console.log(`⚠️  Delegation already exists: ${delegationData.name}`);
    }

    // Create station for this delegation
    const existingStation = await prisma.station.findFirst({
      where: {
        name: delegationData.name,
        delegationId: delegation.id
      }
    });

    if (!existingStation) {
      await prisma.station.create({
        data: {
          name: delegationData.name,
          nameAr: delegationData.nameAr,
          governorateId: monastir.id,
          delegationId: delegation.id,
          address: `${delegationData.name} Station, Monastir Governorate`,
          latitude: delegationData.latitude,
          longitude: delegationData.longitude,
          isActive: true,
          isOnline: true
        }
      });
      console.log(`✅ Created station: ${delegationData.name} Station`);
    } else {
      console.log(`⚠️  Station already exists: ${delegationData.name} Station`);
    }
  }

  // Create routes between all stations
  console.log('\n🛣️  Creating routes between all stations...');
  
  // Get all stations we just created
  const allStations = await prisma.station.findMany({
    where: { governorateId: monastir.id }
  });

  let routesCreated = 0;
  let routesSkipped = 0;

  // Create routes from each station to every other station
  for (const departureStation of allStations) {
    for (const destinationStation of allStations) {
      // Skip self-routes
      if (departureStation.id === destinationStation.id) {
        continue;
      }

      // Check if route already exists
      const existingRoute = await prisma.route.findFirst({
        where: {
          departureStationId: departureStation.id,
          destinationStationId: destinationStation.id
        }
      });

      if (!existingRoute) {
        await prisma.route.create({
          data: {
            departureStationId: departureStation.id,
            destinationStationId: destinationStation.id,
            basePrice: 2.00, // Default price of 2 TND
            isActive: true
          }
        });
        routesCreated++;
        console.log(`✅ Created route: ${departureStation.name} → ${destinationStation.name} (2.00 TND)`);
      } else {
        routesSkipped++;
        console.log(`⚠️  Route already exists: ${departureStation.name} → ${destinationStation.name}`);
      }
    }
  }

  console.log('\n🎉 Complete Monastir seeding finished successfully!');
  
  // Summary
  const totalDelegations = await prisma.delegation.count({
    where: { governorateId: monastir.id }
  });
  
  const totalStations = await prisma.station.count({
    where: { governorateId: monastir.id }
  });

  const totalRoutes = await prisma.route.count({
    where: {
      departureStation: {
        governorateId: monastir.id
      }
    }
  });

  console.log(`\n📊 Summary:`);
  console.log(`   - Governorate: 1 (MONASTIR)`);
  console.log(`   - Delegations: ${totalDelegations}`);
  console.log(`   - Stations: ${totalStations}`);
  console.log(`   - Routes: ${totalRoutes} (${routesCreated} created, ${routesSkipped} already existed)`);
}

main()
  .catch((e) => {
    console.error('❌ Error during seeding:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });