import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function verifyMonastirData() {
  console.log('🔍 Verifying Monastir data...\n');

  try {
    // Check governorate
    const monastir = await prisma.governorate.findUnique({
      where: { name: 'MONASTIR' },
      include: {
        delegations: true
      }
    });

    if (monastir) {
      console.log('✅ Monastir Governorate found:');
      console.log(`   - ID: ${monastir.id}`);
      console.log(`   - Name: ${monastir.name}`);
      console.log(`   - Name (Arabic): ${monastir.nameAr}`);
      console.log(`   - Created: ${monastir.createdAt}`);
      console.log(`   - Number of delegations: ${monastir.delegations.length}\n`);

      console.log('📋 Delegations:');
      monastir.delegations.forEach((delegation, index) => {
        console.log(`   ${index + 1}. ${delegation.name} (${delegation.nameAr})`);
      });
    } else {
      console.log('❌ Monastir governorate not found!');
    }

  } catch (error) {
    console.error('❌ Error verifying data:', error);
  } finally {
    await prisma.$disconnect();
  }
}

verifyMonastirData();