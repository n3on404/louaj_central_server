import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Starting database seeding...');

  // Create Governorates
  const tunis = await prisma.governorate.upsert({
    where: { name: 'Tunis' },
    update: {},
    create: {
      name: 'Tunis',
      nameAr: 'تونس'
    }
  });

  const monastir = await prisma.governorate.upsert({
    where: { name: 'Monastir' },
    update: {},
    create: {
      name: 'Monastir',
      nameAr: 'المنستير'
    }
  });

  const sfax = await prisma.governorate.upsert({
    where: { name: 'Sfax' },
    update: {},
    create: {
      name: 'Sfax',
      nameAr: 'صفاقس'
    }
  });

  const gafsa = await prisma.governorate.upsert({
    where: { name: 'Gafsa' },
    update: {},
    create: {
      name: 'Gafsa',
      nameAr: 'قفصة'
    }
  });

  console.log('✅ Created governorates');

  // Create Delegations
  const tunisCenter = await prisma.delegation.upsert({
    where: { id: 'tunis-center' },
    update: {},
    create: {
      id: 'tunis-center',
      name: 'Tunis Center',
      nameAr: 'تونس المركز',
      governorateId: tunis.id
    }
  });

  const monastirCenter = await prisma.delegation.upsert({
    where: { id: 'monastir-center' },
    update: {},
    create: {
      id: 'monastir-center',
      name: 'Monastir Center',
      nameAr: 'المنستير المركز',
      governorateId: monastir.id
    }
  });

  const sfaxCenter = await prisma.delegation.upsert({
    where: { id: 'sfax-center' },
    update: {},
    create: {
      id: 'sfax-center',
      name: 'Sfax Center',
      nameAr: 'صفاقس المركز',
      governorateId: sfax.id
    }
  });

  const gafsaCenter = await prisma.delegation.upsert({
    where: { id: 'gafsa-center' },
    update: {},
    create: {
      id: 'gafsa-center',
      name: 'Gafsa Center',
      nameAr: 'قفصة المركز',
      governorateId: gafsa.id
    }
  });

  console.log('✅ Created delegations');

  // Create Stations
  const tunisStation = await prisma.station.upsert({
    where: { id: 'tunis-main-station' },
    update: {},
    create: {
      id: 'tunis-main-station',
      name: 'Tunis Main Station',
      nameAr: 'محطة تونس الرئيسية',
      governorateId: tunis.id,
      delegationId: tunisCenter.id,
      address: 'Avenue Habib Bourguiba, Tunis',
      latitude: 36.8065,
      longitude: 10.1815,
      isActive: true,
      isOnline: false // Will be set to true when local node connects
    }
  });

  const monastirStation = await prisma.station.upsert({
    where: { id: 'monastir-main-station' },
    update: {},
    create: {
      id: 'monastir-main-station',
      name: 'Monastir Main Station',
      nameAr: 'محطة المنستير الرئيسية',
      governorateId: monastir.id,
      delegationId: monastirCenter.id,
      address: 'Avenue de l\'Indépendance, Monastir',
      latitude: 35.7617,
      longitude: 10.8276,
      isActive: true,
      isOnline: false
    }
  });

  const sfaxStation = await prisma.station.upsert({
    where: { id: 'sfax-main-station' },
    update: {},
    create: {
      id: 'sfax-main-station',
      name: 'Sfax Main Station',
      nameAr: 'محطة صفاقس الرئيسية',
      governorateId: sfax.id,
      delegationId: sfaxCenter.id,
      address: 'Avenue Hedi Chaker, Sfax',
      latitude: 34.7406,
      longitude: 10.7603,
      isActive: true,
      isOnline: false
    }
  });

  const gafsaStation = await prisma.station.upsert({
    where: { id: 'gafsa-main-station' },
    update: {},
    create: {
      id: 'gafsa-main-station',
      name: 'Gafsa Main Station',
      nameAr: 'محطة قفصة الرئيسية',
      governorateId: gafsa.id,
      delegationId: gafsaCenter.id,
      address: 'Avenue Ali Belhaouane, Gafsa',
      latitude: 34.4217,
      longitude: 8.7842,
      isActive: true,
      isOnline: false
    }
  });

  console.log('✅ Created stations');

  // Create Routes between stations
  const routes = [
    // Tunis routes
    {
      id: 'tunis-monastir-route',
      from: tunisStation.id,
      to: monastirStation.id,
      price: 25.00
    },
    {
      id: 'tunis-sfax-route',
      from: tunisStation.id,
      to: sfaxStation.id,
      price: 35.00
    },
    {
      id: 'tunis-gafsa-route',
      from: tunisStation.id,
      to: gafsaStation.id,
      price: 45.00
    },
    // Monastir routes
    {
      id: 'monastir-tunis-route',
      from: monastirStation.id,
      to: tunisStation.id,
      price: 25.00
    },
    {
      id: 'monastir-sfax-route',
      from: monastirStation.id,
      to: sfaxStation.id,
      price: 20.00
    },
    {
      id: 'monastir-gafsa-route',
      from: monastirStation.id,
      to: gafsaStation.id,
      price: 30.00
    },
    // Sfax routes
    {
      id: 'sfax-tunis-route',
      from: sfaxStation.id,
      to: tunisStation.id,
      price: 35.00
    },
    {
      id: 'sfax-monastir-route',
      from: sfaxStation.id,
      to: monastirStation.id,
      price: 20.00
    },
    {
      id: 'sfax-gafsa-route',
      from: sfaxStation.id,
      to: gafsaStation.id,
      price: 25.00
    },
    // Gafsa routes
    {
      id: 'gafsa-tunis-route',
      from: gafsaStation.id,
      to: tunisStation.id,
      price: 45.00
    },
    {
      id: 'gafsa-monastir-route',
      from: gafsaStation.id,
      to: monastirStation.id,
      price: 30.00
    },
    {
      id: 'gafsa-sfax-route',
      from: gafsaStation.id,
      to: sfaxStation.id,
      price: 25.00
    }
  ];

  for (const route of routes) {
    await prisma.route.upsert({
      where: { id: route.id },
      update: {},
      create: {
        id: route.id,
        departureStationId: route.from,
        destinationStationId: route.to,
        basePrice: route.price,
        isActive: true
      }
    });
  }

  console.log('✅ Created routes');

  // Create Sample Drivers with approval status
  const drivers = [
          {
        cin: '12345678',
        phone: '+21612345678',
        firstName: 'Ahmed',
        lastName: 'Ben Ali',
        originGovernorateId: tunis.id,
        originDelegationId: tunisCenter.id,
        assignedStationId: tunisStation.id,
        accountStatus: 'APPROVED',
        isActive: true
      },
      {
        cin: '87654321',
        phone: '+21687654321',
        firstName: 'Mohamed',
        lastName: 'Trabelsi',
        originGovernorateId: monastir.id,
        originDelegationId: monastirCenter.id,
        assignedStationId: monastirStation.id,
        accountStatus: 'APPROVED',
        isActive: true
      },
      {
        cin: '11223344',
        phone: '+21611223344',
        firstName: 'Youssef',
        lastName: 'Mansouri',
        originGovernorateId: sfax.id,
        originDelegationId: sfaxCenter.id,
        assignedStationId: sfaxStation.id,
        accountStatus: 'PENDING',
        isActive: false
      },
      {
        cin: '44332211',
        phone: '+21644332211',
        firstName: 'Karim',
        lastName: 'Ben Salah',
        originGovernorateId: gafsa.id,
        originDelegationId: gafsaCenter.id,
        assignedStationId: gafsaStation.id,
        accountStatus: 'APPROVED',
        isActive: true
      }
  ];

  const createdDrivers: any[] = [];
  for (const driver of drivers) {
    const createdDriver = await prisma.driver.upsert({
      where: { cin: driver.cin },
      update: {},
      create: {
        cin: driver.cin,
        phoneNumber: driver.phone,
        firstName: driver.firstName,
        lastName: driver.lastName,
        originGovernorateId: driver.originGovernorateId,
        originDelegationId: driver.originDelegationId,
        assignedStationId: driver.assignedStationId,
        accountStatus: driver.accountStatus as 'PENDING' | 'APPROVED' | 'REJECTED',
        isActive: driver.isActive
      }
    });
    createdDrivers.push(createdDriver);
  }

  console.log('✅ Created drivers');

  // Create Sample Vehicles with updated schema
  const vehicles = [
    {
      plate: 'TN-1234-123',
      capacity: 12,
      model: 'Mercedes Sprinter',
      year: 2020,
      color: 'White'
    },
    {
      plate: 'TN-5678-456',
      capacity: 15,
      model: 'Ford Transit',
      year: 2019,
      color: 'Blue'
    },
    {
      plate: 'TN-9012-789',
      capacity: 10,
      model: 'Iveco Daily',
      year: 2021,
      color: 'Red'
    },
    {
      plate: 'TN-3456-012',
      capacity: 14,
      model: 'Volkswagen Crafter',
      year: 2018,
      color: 'Silver'
    }
  ];

  const createdVehicles: any[] = [];
  for (let i = 0; i < vehicles.length; i++) {
    const vehicle = vehicles[i];
    
    // Create vehicle
    const createdVehicle = await prisma.vehicle.upsert({
      where: { licensePlate: vehicle.plate },
      update: {},
      create: {
        licensePlate: vehicle.plate,
        capacity: vehicle.capacity,
        model: vehicle.model,
        year: vehicle.year,
        color: vehicle.color,
        isActive: createdDrivers[i].isActive, // Vehicle active if driver is active
        isAvailable: true
      }
    });
    
    // Link driver to vehicle (one-to-one)
    await prisma.driver.update({
      where: { id: createdDrivers[i].id },
      data: { vehicleId: createdVehicle.id }
    });
    
    createdVehicles.push(createdVehicle);
  }

  console.log('✅ Created vehicles');

  // Create Authorized Stations for each Vehicle
  const vehicleAuthorizedStations = [
    // Vehicle 1 (TN-1234-123): Tunis ↔ Monastir ↔ Sfax
    {
      vehicleId: createdVehicles[0].id,
      stationIds: [tunisStation.id, monastirStation.id, sfaxStation.id]
    },
    // Vehicle 2 (TN-5678-456): Monastir ↔ Sfax ↔ Gafsa
    {
      vehicleId: createdVehicles[1].id,
      stationIds: [monastirStation.id, sfaxStation.id, gafsaStation.id]
    },
    // Vehicle 3 (TN-9012-789): Tunis ↔ Gafsa (direct long route)
    {
      vehicleId: createdVehicles[2].id,
      stationIds: [tunisStation.id, gafsaStation.id]
    },
    // Vehicle 4 (TN-3456-012): All stations (premium service)
    {
      vehicleId: createdVehicles[3].id,
      stationIds: [tunisStation.id, monastirStation.id, sfaxStation.id, gafsaStation.id]
    }
  ];

  for (const vehicleAuth of vehicleAuthorizedStations) {
    for (const stationId of vehicleAuth.stationIds) {
      await prisma.vehicleAuthorizedStation.create({
        data: {
          vehicleId: vehicleAuth.vehicleId,
          stationId: stationId
        }
      });
    }
  }

  console.log('✅ Created vehicle authorized stations');

  // Create Staff for each station
  const staffMembers = [
    // Monastir Station Staff
    {
      cin: 'SUPER001',
      phone: '+21612345679',
      firstName: 'Fatma',
      lastName: 'Mansouri',
      role: 'SUPERVISOR',
      stationId: monastirStation.id
    },
    {
      cin: 'WORK001',
      phone: '+21612345680',
      firstName: 'Mohamed',
      lastName: 'Trabelsi',
      role: 'WORKER',
      stationId: monastirStation.id
    },
    // Tunis Station Staff
    {
      cin: 'SUPER002',
      phone: '+21612345681',
      firstName: 'Amina',
      lastName: 'Ben Salem',
      role: 'SUPERVISOR',
      stationId: tunisStation.id
    },
    {
      cin: 'WORK002',
      phone: '+21612345682',
      firstName: 'Ali',
      lastName: 'Gharbi',
      role: 'WORKER',
      stationId: tunisStation.id
    },
    // Sfax Station Staff
    {
      cin: 'SUPER003',
      phone: '+21612345683',
      firstName: 'Nadia',
      lastName: 'Bouazizi',
      role: 'SUPERVISOR',
      stationId: sfaxStation.id
    },
    {
      cin: 'WORK003',
      phone: '+21612345684',
      firstName: 'Sami',
      lastName: 'Khelifi',
      role: 'WORKER',
      stationId: sfaxStation.id
    },
    // Gafsa Station Staff
    {
      cin: 'SUPER004',
      phone: '+21612345685',
      firstName: 'Leila',
      lastName: 'Hamdi',
      role: 'SUPERVISOR',
      stationId: gafsaStation.id
    },
    {
      cin: 'WORK004',
      phone: '+21612345686',
      firstName: 'Omar',
      lastName: 'Sassi',
      role: 'WORKER',
      stationId: gafsaStation.id
    }
  ];

  for (const staff of staffMembers) {
    await prisma.staff.upsert({
      where: { cin: staff.cin },
      update: {},
      create: {
        cin: staff.cin,
        phoneNumber: staff.phone,
        firstName: staff.firstName,
        lastName: staff.lastName,
        role: staff.role as 'WORKER' | 'SUPERVISOR',
        stationId: staff.stationId,
        isActive: true
      }
    });
  }

  console.log('✅ Created staff members');

  // Create some sample vehicle queue entries (for testing)
  const sampleQueues = [
    {
      vehicleId: createdVehicles[0].id,
      stationId: monastirStation.id,
      destinationId: tunisStation.id,
      queueType: 'OVERNIGHT' as const,
      queuePosition: 1,
      availableSeats: 12,
      totalSeats: 12,
      basePrice: 25.00,
      estimatedDeparture: new Date(Date.now() + 2 * 60 * 60 * 1000) // 2 hours from now
    },
    {
      vehicleId: createdVehicles[1].id,
      stationId: monastirStation.id,
      destinationId: sfaxStation.id,
      queueType: 'REGULAR' as const,
      queuePosition: 1,
      availableSeats: 15,
      totalSeats: 15,
      basePrice: 20.00,
      estimatedDeparture: new Date(Date.now() + 1 * 60 * 60 * 1000) // 1 hour from now
    }
  ];

  for (const queue of sampleQueues) {
    await prisma.vehicleQueue.create({
      data: queue
    });
  }

  console.log('✅ Created sample vehicle queues');

  console.log('🎉 Database seeding completed successfully!');
  console.log('\n📊 Created:');
  console.log(`   • 4 Governorates (Tunis, Monastir, Sfax, Gafsa)`);
  console.log(`   • 4 Delegations`);
  console.log(`   • 4 Stations with GPS coordinates`);
  console.log(`   • 12 Routes (bidirectional connections)`);
  console.log(`   • 4 Drivers with phone numbers`);
  console.log(`   • 4 Vehicles (TN-1234-123, TN-5678-456, TN-9012-789, TN-3456-012)`);
  console.log(`   • Vehicle authorized stations:`);
  console.log(`     - TN-1234-123: Tunis ↔ Monastir ↔ Sfax`);
  console.log(`     - TN-5678-456: Monastir ↔ Sfax ↔ Gafsa`);
  console.log(`     - TN-9012-789: Tunis ↔ Gafsa (direct)`);
  console.log(`     - TN-3456-012: All stations (premium)`);
  console.log(`   • 8 Staff members (2 per station: Supervisor + Worker)`);
  console.log(`   • 2 Sample vehicle queue entries`);
  
  console.log('\n🔗 Ready for Socket.IO testing with station IDs:');
  console.log(`   • monastir-main-station`);
  console.log(`   • tunis-main-station`);
  console.log(`   • sfax-main-station`);
  console.log(`   • gafsa-main-station`);
}

main()
  .catch((e) => {
    console.error('❌ Error during seeding:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  }); 