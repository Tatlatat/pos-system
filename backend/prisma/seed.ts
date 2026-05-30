import { PrismaClient, UserRole } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Starting seed...');

  // ===== Branches =====
  const branches = await Promise.all([
    prisma.branch.upsert({
      where: { code: 'BR-HQ' },
      update: {},
      create: { code: 'BR-HQ', name: 'Trụ sở chính (Kho tổng)', address: '123 Nguyễn Huệ, Q.1, TP.HCM', phone: '0281234567' },
    }),
    prisma.branch.upsert({
      where: { code: 'BR-001' },
      update: {},
      create: { code: 'BR-001', name: 'Chi nhánh Trung tâm', address: '456 Lê Lợi, Q.1, TP.HCM', phone: '0282345678' },
    }),
    prisma.branch.upsert({
      where: { code: 'BR-002' },
      update: {},
      create: { code: 'BR-002', name: 'Chi nhánh Tân Bình', address: '789 Cộng Hòa, Tân Bình, TP.HCM', phone: '0283456789' },
    }),
    prisma.branch.upsert({
      where: { code: 'BR-003' },
      update: {},
      create: { code: 'BR-003', name: 'Chi nhánh Thủ Đức', address: '321 Võ Văn Ngân, Thủ Đức, TP.HCM', phone: '0284567890' },
    }),
    prisma.branch.upsert({
      where: { code: 'BR-004' },
      update: {},
      create: { code: 'BR-004', name: 'Chi nhánh Bình Thạnh', address: '159 Phạm Văn Đồng, Bình Thạnh, TP.HCM', phone: '0285678901' },
    }),
  ]);

  console.log(`✅ ${branches.length} branches created`);

  // ===== Users =====
  const passwordHash = await bcrypt.hash('password123', 10);

  const users = await Promise.all([
    prisma.user.upsert({
      where: { email: 'admin@pos.com' },
      update: {},
      create: {
        email: 'admin@pos.com',
        passwordHash,
        fullName: 'Super Admin',
        phone: '0900000001',
        role: UserRole.SUPER_ADMIN,
        branchId: branches[0].id,
      },
    }),
    prisma.user.upsert({
      where: { email: 'owner@pos.com' },
      update: {},
      create: {
        email: 'owner@pos.com',
        passwordHash,
        fullName: 'Chủ cửa hàng',
        phone: '0900000002',
        role: UserRole.OWNER,
      },
    }),
    prisma.user.upsert({
      where: { email: 'manager@pos.com' },
      update: {},
      create: {
        email: 'manager@pos.com',
        passwordHash,
        fullName: 'Quản lý chi nhánh',
        phone: '0900000003',
        role: UserRole.BRANCH_MANAGER,
        branchId: branches[1].id,
      },
    }),
    prisma.user.upsert({
      where: { email: 'cashier1@pos.com' },
      update: {},
      create: {
        email: 'cashier1@pos.com',
        passwordHash,
        fullName: 'Thu ngân 1',
        phone: '0900000004',
        role: UserRole.CASHIER,
        branchId: branches[1].id,
      },
    }),
    prisma.user.upsert({
      where: { email: 'cashier2@pos.com' },
      update: {},
      create: {
        email: 'cashier2@pos.com',
        passwordHash,
        fullName: 'Thu ngân 2',
        phone: '0900000005',
        role: UserRole.CASHIER,
        branchId: branches[1].id,
      },
    }),
    prisma.user.upsert({
      where: { email: 'inventory@pos.com' },
      update: {},
      create: {
        email: 'inventory@pos.com',
        passwordHash,
        fullName: 'Nhân viên kho',
        phone: '0900000006',
        role: UserRole.INVENTORY_STAFF,
        branchId: branches[0].id,
      },
    }),
  ]);

  console.log(`✅ ${users.length} users created`);

  // ===== Categories =====
  const categories = await Promise.all([
    prisma.category.upsert({ where: { name: 'Đồ uống' }, update: {}, create: { name: 'Đồ uống', description: 'Nước ngọt, nước khoáng, bia, rượu' } }),
    prisma.category.upsert({ where: { name: 'Bánh kẹo' }, update: {}, create: { name: 'Bánh kẹo', description: 'Bánh, kẹo, snack' } }),
    prisma.category.upsert({ where: { name: 'Sữa' }, update: {}, create: { name: 'Sữa', description: 'Sữa tươi, sữa chua, sữa đặc' } }),
    prisma.category.upsert({ where: { name: 'Thực phẩm' }, update: {}, create: { name: 'Thực phẩm', description: 'Mì gói, đồ hộp, gia vị' } }),
    prisma.category.upsert({ where: { name: 'Vệ sinh cá nhân' }, update: {}, create: { name: 'Vệ sinh cá nhân', description: 'Xà phòng, dầu gội, kem đánh răng' } }),
    prisma.category.upsert({ where: { name: 'Vật dụng gia đình' }, update: {}, create: { name: 'Vật dụng gia đình', description: 'Chén, đĩa, dao, thớt' } }),
  ]);

  console.log(`✅ ${categories.length} categories created`);

  // ===== Products (20 sample products) =====
  const productsData = [
    { sku: 'SKU001', barcode: '8934567890123', name: 'Coca Cola 330ml', unit: 'lon', costPrice: 5000, sellingPrice: 10000, minStock: 50, categoryId: categories[0].id },
    { sku: 'SKU002', barcode: '8934567890124', name: 'Pepsi 330ml', unit: 'lon', costPrice: 5000, sellingPrice: 10000, minStock: 50, categoryId: categories[0].id },
    { sku: 'SKU003', barcode: '8934567890125', name: 'Sting Đỏ 330ml', unit: 'lon', costPrice: 6000, sellingPrice: 12000, minStock: 30, categoryId: categories[0].id },
    { sku: 'SKU004', barcode: '8934567890126', name: 'Nước suối Lavie 500ml', unit: 'chai', costPrice: 3000, sellingPrice: 6000, minStock: 100, categoryId: categories[0].id },
    { sku: 'SKU005', barcode: '8934567890127', name: 'Oreo 72g', unit: 'gói', costPrice: 8000, sellingPrice: 15000, minStock: 30, categoryId: categories[1].id },
    { sku: 'SKU006', barcode: '8934567890128', name: 'Snack Poca 45g', unit: 'gói', costPrice: 5000, sellingPrice: 10000, minStock: 40, categoryId: categories[1].id },
    { sku: 'SKU007', barcode: '8934567890129', name: 'Kẹo Chupa Chups', unit: 'cái', costPrice: 2000, sellingPrice: 5000, minStock: 100, categoryId: categories[1].id },
    { sku: 'SKU008', barcode: '8934567890130', name: 'Sữa tươi TH True Milk 1L', unit: 'hộp', costPrice: 25000, sellingPrice: 38000, minStock: 20, categoryId: categories[2].id },
    { sku: 'SKU009', barcode: '8934567890131', name: 'Sữa chua Vinamilk', unit: 'hộp', costPrice: 4000, sellingPrice: 8000, minStock: 50, categoryId: categories[2].id },
    { sku: 'SKU010', barcode: '8934567890132', name: 'Sữa đặc Ông Thọ 380g', unit: 'lon', costPrice: 18000, sellingPrice: 28000, minStock: 15, categoryId: categories[2].id },
    { sku: 'SKU011', barcode: '8934567890133', name: 'Mì gói Hảo Hảo 75g', unit: 'gói', costPrice: 3000, sellingPrice: 5000, minStock: 200, categoryId: categories[3].id },
    { sku: 'SKU012', barcode: '8934567890134', name: 'Cá hộp 3 Cô Gái 155g', unit: 'hộp', costPrice: 15000, sellingPrice: 25000, minStock: 20, categoryId: categories[3].id },
    { sku: 'SKU013', barcode: '8934567890135', name: 'Nước tương Tam Thái Tử 500ml', unit: 'chai', costPrice: 12000, sellingPrice: 20000, minStock: 15, categoryId: categories[3].id },
    { sku: 'SKU014', barcode: '8934567890136', name: 'Dầu ăn Tường An 1L', unit: 'chai', costPrice: 28000, sellingPrice: 42000, minStock: 10, categoryId: categories[3].id },
    { sku: 'SKU015', barcode: '8934567890137', name: 'Kem đánh răng P/S 175g', unit: 'tuýp', costPrice: 15000, sellingPrice: 25000, minStock: 20, categoryId: categories[4].id },
    { sku: 'SKU016', barcode: '8934567890138', name: 'Dầu gội Sunsilk 180ml', unit: 'chai', costPrice: 22000, sellingPrice: 35000, minStock: 15, categoryId: categories[4].id },
    { sku: 'SKU017', barcode: '8934567890139', name: 'Xà bông Lifebuoy 90g', unit: 'bánh', costPrice: 7000, sellingPrice: 13000, minStock: 30, categoryId: categories[4].id },
    { sku: 'SKU018', barcode: '8934567890140', name: 'Nước rửa chén Sunlight 750ml', unit: 'chai', costPrice: 18000, sellingPrice: 30000, minStock: 15, categoryId: categories[5].id },
    { sku: 'SKU019', barcode: '8934567890141', name: 'Nước giặt Omo 1.5L', unit: 'chai', costPrice: 45000, sellingPrice: 68000, minStock: 10, categoryId: categories[5].id },
    { sku: 'SKU020', barcode: '8934567890142', name: 'Khăn giấy ướt Bobby 50 tờ', unit: 'gói', costPrice: 8000, sellingPrice: 15000, minStock: 30, categoryId: categories[5].id },
  ];

  const createdProducts = [];
  for (const data of productsData) {
    const product = await prisma.product.upsert({
      where: { sku: data.sku },
      update: {},
      create: data,
    });
    createdProducts.push(product);
  }

  console.log(`✅ ${createdProducts.length} products created`);

  // ===== Inventory Stock for all branches =====
  for (const branch of branches) {
    for (const product of createdProducts) {
      await prisma.inventoryStock.upsert({
        where: { productId_branchId: { productId: product.id, branchId: branch.id } },
        update: {},
        create: {
          productId: product.id,
          branchId: branch.id,
          quantity: branch.code === 'BR-HQ' ? Math.floor(Math.random() * 200) + 50 : Math.floor(Math.random() * 100) + 10,
        },
      });
    }
  }

  console.log(`✅ Inventory stock initialized for ${branches.length} branches x ${createdProducts.length} products`);

  // ===== Customers =====
  await prisma.customer.upsert({
    where: { phone: '0901111111' },
    update: {},
    create: { name: 'Nguyễn Văn An', phone: '0901111111', email: 'an.nguyen@gmail.com' },
  });
  await prisma.customer.upsert({
    where: { phone: '0902222222' },
    update: {},
    create: { name: 'Trần Thị Bình', phone: '0902222222', email: 'binh.tran@gmail.com' },
  });

  console.log(`✅ Customers created`);

  // ===== Loyalty Rule =====
  await prisma.loyaltyRule.upsert({
    where: { id: 'default-rule' },
    update: {},
    create: {
      id: 'default-rule',
      spendPerPoint: 100000,
      pointValue: 1000,
      isActive: true,
    },
  });

  console.log(`✅ Loyalty rule created`);

  // ===== System Settings =====
  const settings = [
    { key: 'vat_rate', value: '8.00', group: 'tax', description: 'VAT rate (%)' },
    { key: 'currency', value: 'VND', group: 'general', description: 'Default currency' },
    { key: 'return_days', value: '7', group: 'policy', description: 'Return period (days)' },
    { key: 'company_name', value: 'POS Minimart Chain', group: 'general', description: 'Company name' },
  ];

  for (const setting of settings) {
    await prisma.systemSetting.upsert({
      where: { key: setting.key },
      update: {},
      create: setting,
    });
  }

  console.log(`✅ System settings created`);

  // ===== Sample Suppliers =====
  await prisma.supplier.upsert({
    where: { code: 'SUP-001' },
    update: {},
    create: {
      code: 'SUP-001',
      name: 'Công ty TNHH Nước giải khát Sài Gòn',
      contactPerson: 'Nguyễn Văn B',
      phone: '0908888881',
      email: 'contact@saigonbev.com',
      address: '123 Nguyễn Tất Thành, Q.4, TP.HCM',
    },
  });
  await prisma.supplier.upsert({
    where: { code: 'SUP-002' },
    update: {},
    create: {
      code: 'SUP-002',
      name: 'Công ty CP Thực phẩm ABC',
      contactPerson: 'Trần Văn C',
      phone: '0908888882',
      email: 'info@abcfood.vn',
      address: '456 Lý Thường Kiệt, Q.10, TP.HCM',
    },
  });
  await prisma.supplier.upsert({
    where: { code: 'SUP-003' },
    update: {},
    create: {
      code: 'SUP-003',
      name: 'Công ty TNHH Sữa Việt Nam',
      contactPerson: 'Lê Thị D',
      phone: '0908888883',
      email: 'sales@vinamilk.vn',
      address: '789 Nguyễn Đình Chiểu, Q.3, TP.HCM',
    },
  });

  console.log(`✅ Suppliers created`);

  // ===== Sample Purchase Orders =====
  const po = await prisma.purchaseOrder.upsert({
    where: { poNumber: 'PO-SAMPLE-001' },
    update: {},
    create: {
      poNumber: 'PO-SAMPLE-001',
      status: 'APPROVED',
      supplierId: (await prisma.supplier.findFirstOrThrow({ where: { code: 'SUP-001' } })).id,
      createdById: users[0].id,
      approvedById: users[0].id,
      approvedAt: new Date(),
      totalCost: 5000000,
      notes: 'Đơn hàng mẫu',
    },
  });

  console.log(`✅ Sample data created`);
  console.log('\n📋 Login Credentials:');
  console.log('   Super Admin:  admin@pos.com / password123');
  console.log('   Owner:        owner@pos.com / password123');
  console.log('   Manager:      manager@pos.com / password123');
  console.log('   Cashier:      cashier1@pos.com / password123');
  console.log('   Inventory:    inventory@pos.com / password123');
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
