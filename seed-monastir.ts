import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Starting Monastir governorate seeding...');

  // Create Monastir Governorate
  const monastir = await prisma.governorate.upsert({
    where: { name: 'MONASTIR' },
    update: {},
    create: {
      name: 'MONASTIR',
      nameAr: 'المنستير'
    }
  });

  console.log('✅ Created Monastir governorate');

  // Create Delegations
  const delegations = [
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

  for (const delegationData of delegations) {
    // Check if delegation already exists
    const existingDelegation = await prisma.delegation.findFirst({
      where: {
        name: delegationData.name,
        governorateId: monastir.id
      }
    });

    if (!existingDelegation) {
      await prisma.delegation.create({
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
  }

  console.log('✅ Created all Monastir delegations');
  console.log('🎉 Monastir seeding completed successfully!');
}

main()
  .catch((e) => {
    console.error('❌ Error during seeding:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });