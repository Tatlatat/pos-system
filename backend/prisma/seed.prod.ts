import { PrismaClient, UserRole } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

/**
 * Production seed — only creates essential data.
 * Run once: npx prisma db seed
 */
async function main() {
  console.log('🌱 Seeding production data...');

  // Only seed if no users exist
  const userCount = await prisma.user.count();
  if (userCount > 0) {
    console.log('✅ Users already exist — skipping seed');
    return;
  }

  const passwordHash = await bcrypt.hash('admin123', 10);

  // Create HQ branch
  const hq = await prisma.branch.create({
    data: {
      code: 'BR-HQ',
      name: 'Trụ sở chính',
      address: 'Your Address Here',
    },
  });

  // Create Super Admin
  await prisma.user.create({
    data: {
      email: 'admin@pos.com',
      passwordHash,
      fullName: 'Super Admin',
      role: UserRole.SUPER_ADMIN,
      branchId: hq.id,
    },
  });

  // Default settings
  await prisma.systemSetting.createMany({
    data: [
      { key: 'vat_rate', value: '8.00', group: 'tax', description: 'VAT rate (%)' },
      { key: 'currency', value: 'VND', group: 'general', description: 'Default currency' },
      { key: 'return_days', value: '7', group: 'policy', description: 'Return period (days)' },
    ],
    skipDuplicates: true,
  });

  console.log('✅ Admin account created: admin@pos.com / admin123');
  console.log('⚠️  CHANGE THE PASSWORD AFTER FIRST LOGIN!');
}

main()
  .then(async () => { await prisma.$disconnect(); })
  .catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
