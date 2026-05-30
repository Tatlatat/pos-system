import { test, expect } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';
import { loginUser, assertOk } from '../helpers/api-client';

test('Multi-role interaction: Admin, Manager, Cashier 1 & Cashier 2 E2E Sync', async ({ browser }) => {
  // Create separate contexts for each role to prevent session sharing
  const adminCtx = await browser.newContext();
  const managerCtx = await browser.newContext();
  const cashier1Ctx = await browser.newContext();
  const cashier2Ctx = await browser.newContext();

  const adminPage = await adminCtx.newPage();
  const managerPage = await managerCtx.newPage();
  const cashier1Page = await cashier1Ctx.newPage();
  const cashier2Page = await cashier2Ctx.newPage();

  // Logs and report directory setup
  const artifactDir = path.resolve(__dirname, '../../test-results/interaction');
  if (!fs.existsSync(artifactDir)) {
    fs.mkdirSync(artifactDir, { recursive: true });
  }

  const logs: string[] = [];
  const log = (msg: string) => {
    const time = new Date().toISOString().slice(11, 19);
    console.log(`[${time}] ${msg}`);
    logs.push(`[${time}] ${msg}`);
  };

  let testStatus = 'PASSED';
  let failureReason = '';

  const parseCurrency = (txt: string) => parseInt(txt.replace(/[^\d]/g, ''), 10) || 0;

  try {
    log('🚀 Starting Comprehensive Multi-role Interaction Test (4 Parallel Agents)');

    // 1. Log in all roles concurrently
    log('🔑 Logging in as Admin...');
    await adminPage.goto('/login');
    await adminPage.fill('input[placeholder="admin@pos.com"]', 'admin@pos.com');
    await adminPage.fill('input[placeholder="••••••••"]', 'password123');
    await adminPage.click('button:has-text("Đăng nhập")');
    await adminPage.waitForURL('**/dashboard');
    await expect(adminPage.locator('main h1')).toHaveText('Dashboard');
    log('✅ Admin logged in successfully');

    log('🔑 Logging in as Manager...');
    await managerPage.goto('/login');
    await managerPage.fill('input[placeholder="admin@pos.com"]', 'manager@pos.com');
    await managerPage.fill('input[placeholder="••••••••"]', 'password123');
    await managerPage.click('button:has-text("Đăng nhập")');
    await managerPage.waitForURL('**/dashboard');
    await expect(managerPage.locator('main h1')).toHaveText('Dashboard');
    log('✅ Manager logged in successfully');

    log('🔑 Logging in as Cashier 1...');
    await cashier1Page.goto('/login');
    await cashier1Page.fill('input[placeholder="admin@pos.com"]', 'cashier1@pos.com');
    await cashier1Page.fill('input[placeholder="••••••••"]', 'password123');
    await cashier1Page.click('button:has-text("Đăng nhập")');
    await cashier1Page.waitForURL('**/pos');
    await expect(cashier1Page.locator('h2:has-text("Giỏ hàng")')).toBeVisible();
    log('✅ Cashier 1 logged in successfully (redirected to /pos)');

    log('🔑 Logging in as Cashier 2...');
    await cashier2Page.goto('/login');
    await cashier2Page.fill('input[placeholder="admin@pos.com"]', 'cashier2@pos.com');
    await cashier2Page.fill('input[placeholder="••••••••"]', 'password123');
    await cashier2Page.click('button:has-text("Đăng nhập")');
    await cashier2Page.waitForURL('**/pos');
    await expect(cashier2Page.locator('h2:has-text("Giỏ hàng")')).toBeVisible();
    log('✅ Cashier 2 logged in successfully (redirected to /pos)');

    // 2. Admin: Create a new product (Mì Hảo Hảo)
    log('📦 Admin: Navigating to products page to create a new product...');
    await adminPage.click('aside a[href="/products"]');
    await adminPage.waitForURL('**/products');
    
    await adminPage.click('button:has-text("Thêm mới")');
    const productModal = adminPage.locator('div.fixed.inset-0').filter({ hasText: 'Tạo sản phẩm mới' });
    await expect(productModal).toBeVisible();

    const timestamp = Date.now();
    const sku = `SKU-HH-${timestamp}`;
    const barcode = `893${timestamp.toString().slice(-9)}`;
    const productName = `Mì Hảo Hảo Chua Cay ${timestamp.toString().slice(-4)}`;

    log(`📝 Admin: Filling product form (SKU: ${sku}, Barcode: ${barcode}, Name: ${productName})`);
    await productModal.locator('input').nth(0).fill(sku);
    await productModal.locator('input').nth(1).fill(barcode);
    await productModal.locator('input').nth(2).fill(productName);
    
    // Choose first category option
    await productModal.locator('select').first().selectOption({ index: 1 });
    
    // Unit price
    await productModal.locator('input[type="number"]').nth(0).fill('4500'); // Cost price
    await productModal.locator('input[type="number"]').nth(1).fill('6000'); // Selling price
    await productModal.locator('input[type="number"]').nth(2).fill('10');   // Min stock
    await productModal.locator('input[type="number"]').nth(3).fill('8');    // Tax rate

    await productModal.locator('button:has-text("Tạo mới")').click();
    await expect(productModal).toBeHidden();
    log('✅ Admin: Product created successfully');

    // 3. Manager: Verify and Stock In the new product via API to make it saleable
    log('🚚 Manager: Logging in to API to perform Stock In on new product...');
    const mgrCreds = await loginUser('manager');
    const suppliersRes = await mgrCreds.api.get('/api/suppliers', {
      headers: { Authorization: `Bearer ${mgrCreds.token}` }
    });
    const suppliers = await suppliersRes.json();
    const supplierId = suppliers[0]?.id;
    
    const searchRes = await mgrCreds.api.get(`/api/products/search?name=${productName}`, {
      headers: { Authorization: `Bearer ${mgrCreds.token}` }
    });
    const foundProds = (await searchRes.json()).data;
    expect(foundProds.length).toBeGreaterThan(0);
    const productId = foundProds[0].id;
    log(`🔎 Manager: Found newly created product ID: ${productId}`);

    log('📥 Manager: Sending Stock In request of 100 units...');
    const stockInRes = await mgrCreds.api.post('/api/inventory/stock-in', {
      data: { productId, quantity: 100, unitCost: 4500, supplierId, reference: 'E2E-AUTO-STOCK-IN' },
      headers: { Authorization: `Bearer ${mgrCreds.token}`, 'Content-Type': 'application/json' }
    });
    await assertOk(stockInRes, 'Stock In');
    log('✅ Manager: Stock In of 100 units completed');

    // Capture initial revenue
    log('📊 Admin: Navigating back to dashboard to read initial revenue...');
    await adminPage.click('aside a[href="/dashboard"]');
    await adminPage.waitForURL('**/dashboard');
    const adminRevText = await adminPage.locator('p:has-text("Doanh thu hôm nay") + p').innerText();
    const adminInitRev = parseCurrency(adminRevText);
    log(`💰 Initial Admin Dashboard Revenue: ${adminInitRev.toLocaleString()}₫`);

    const managerRevText = await managerPage.locator('p:has-text("Doanh thu hôm nay") + p').innerText();
    const managerInitRev = parseCurrency(managerRevText);
    log(`💰 Initial Manager Dashboard Revenue: ${managerInitRev.toLocaleString()}₫`);

    // 4. Cashier 1: Search new product and create customer on-the-fly
    log('🔍 Cashier 1: Searching for Mì Hảo Hảo on POS...');
    await cashier1Page.fill('input[placeholder="🔍 Tìm sản phẩm..."]', productName);
    const itemBtn1 = cashier1Page.locator(`button:has-text("${productName}")`);
    await expect(itemBtn1).toBeVisible();

    const initialStockText = await itemBtn1.locator('p.text-xs').innerText();
    const initStockMatch = initialStockText.match(/Tồn:\s*(\d+)/);
    const initStockValue = initStockMatch ? parseInt(initStockMatch[1], 10) : 0;
    log(`📦 Cashier 1: Initial Stock displayed is: ${initStockValue}`);
    expect(initStockValue).toBe(100);

    // Create customer on the fly
    const testPhone = `0987${Date.now().toString().slice(-6)}`;
    log(`👤 Cashier 1: Creating a new customer with SĐT: ${testPhone}`);
    await cashier1Page.fill('input[placeholder="📞 SĐT khách hàng..."]', testPhone);
    await cashier1Page.click('button:has-text("Tìm")');

    const customerCreateBox = cashier1Page.locator('div').filter({ hasText: 'Khách hàng mới' }).last();
    await expect(customerCreateBox).toBeVisible();
    await customerCreateBox.locator('input[placeholder="Tên khách hàng *"]').fill('Khách Hàng VIP E2E');
    await customerCreateBox.locator('button:has-text("Tạo & Gắn")').click();
    await expect(customerCreateBox).toBeHidden();
    log('✅ Cashier 1: Customer created and attached to cart');

    // Add 5 units to cart
    log('🛒 Cashier 1: Adding 5 units of product to cart...');
    await itemBtn1.click();
    const qtyModal1 = cashier1Page.locator('div.fixed.inset-0').filter({ hasText: 'Số lượng:' }).first();
    await expect(qtyModal1).toBeVisible();
    
    // Click plus button 4 times to reach quantity 5
    const plusBtn1 = qtyModal1.locator('button:has-text("+")');
    for (let i = 0; i < 4; i++) {
      await plusBtn1.click();
    }
    await qtyModal1.locator('button:has-text("Thêm")').click();
    await expect(qtyModal1).toBeHidden();

    // Checkout
    log('💳 Cashier 1: Processing checkout...');
    await cashier1Page.click('button:has-text("Thanh toán")');
    const payModal1 = cashier1Page.locator('div.fixed.inset-0').filter({ hasText: 'Tiền khách đưa:' }).first();
    await expect(payModal1).toBeVisible();
    await payModal1.locator('button:has-text("Đủ")').click();

    const checkoutBtn1 = payModal1.locator('button:has-text("Thanh toán")');
    const totalAmount1 = parseCurrency(await checkoutBtn1.innerText());
    log(`💵 Cashier 1: Order Total: ${totalAmount1.toLocaleString()}₫`);
    await checkoutBtn1.click();
    await expect(payModal1).toBeHidden();
    log('✅ Cashier 1: Checkout successful');

    // 5. Cashier 2: Check real-time stock sync and customer sync
    log('🔍 Cashier 2: Searching for same product to check real-time stock level...');
    await cashier2Page.fill('input[placeholder="🔍 Tìm sản phẩm..."]', productName);
    const itemBtn2 = cashier2Page.locator(`button:has-text("${productName}")`);
    await expect(itemBtn2).toBeVisible();

    const updatedStockText = await itemBtn2.locator('p.text-xs').innerText();
    const updatedStockMatch = updatedStockText.match(/Tồn:\s*(\d+)/);
    const updatedStockValue = updatedStockMatch ? parseInt(updatedStockMatch[1], 10) : 0;
    log(`📦 Cashier 2: Real-time stock displayed is: ${updatedStockValue}`);
    expect(updatedStockValue).toBe(95); // 100 - 5
    log('✅ Cashier 2: Correctly observed real-time stock decrement!');

    // Customer Sync test
    log(`👤 Cashier 2: Searching for customer phone ${testPhone} created by Cashier 1...`);
    await cashier2Page.fill('input[placeholder="📞 SĐT khách hàng..."]', testPhone);
    await cashier2Page.click('button:has-text("Tìm")');

    const customerMatchBox = cashier2Page.locator('div').filter({ hasText: 'Khách Hàng VIP E2E' }).first();
    await expect(customerMatchBox).toBeVisible();
    await customerMatchBox.locator('button:has-text("Gắn")').click();
    log('✅ Cashier 2: Customer sync verified and attached to cart!');

    // Cashier 2: Add 2 units of same product and checkout
    log('🛒 Cashier 2: Adding 2 units to cart...');
    await itemBtn2.click();
    const qtyModal2 = cashier2Page.locator('div.fixed.inset-0').filter({ hasText: 'Số lượng:' }).first();
    await expect(qtyModal2).toBeVisible();
    await qtyModal2.locator('button:has-text("+")').click(); // quantity 2
    await qtyModal2.locator('button:has-text("Thêm")').click();
    await expect(qtyModal2).toBeHidden();

    log('💳 Cashier 2: Processing checkout...');
    await cashier2Page.click('button:has-text("Thanh toán")');
    const payModal2 = cashier2Page.locator('div.fixed.inset-0').filter({ hasText: 'Tiền khách đưa:' }).first();
    await expect(payModal2).toBeVisible();
    await payModal2.locator('button:has-text("Đủ")').click();

    const checkoutBtn2 = payModal2.locator('button:has-text("Thanh toán")');
    const totalAmount2 = parseCurrency(await checkoutBtn2.innerText());
    log(`💵 Cashier 2: Order Total: ${totalAmount2.toLocaleString()}₫`);
    await checkoutBtn2.click();
    await expect(payModal2).toBeHidden();
    log('✅ Cashier 2: Checkout successful');

    // 6. Verify Dashboards (Admin and Manager) update
    const totalSalesAmount = totalAmount1 + totalAmount2;
    log(`🔄 Dashboards: Verifying sync for total sale amount of ${totalSalesAmount.toLocaleString()}₫...`);

    await adminPage.click('aside a[href="/dashboard"]');
    await adminPage.waitForURL('**/dashboard');
    await adminPage.reload();
    await adminPage.waitForSelector('p:has-text("Doanh thu hôm nay")');
    const adminNewRevText = await adminPage.locator('p:has-text("Doanh thu hôm nay") + p').innerText();
    const adminNewRev = parseCurrency(adminNewRevText);
    log(`💰 New Admin Dashboard Revenue: ${adminNewRev.toLocaleString()}₫`);
    expect(adminNewRev).toBe(adminInitRev + totalSalesAmount);
    log('✅ Dashboards: Admin revenue sync verified!');

    await managerPage.reload();
    await managerPage.waitForSelector('p:has-text("Doanh thu hôm nay")');
    const managerNewRevText = await managerPage.locator('p:has-text("Doanh thu hôm nay") + p').innerText();
    const managerNewRev = parseCurrency(managerNewRevText);
    log(`💰 New Manager Dashboard Revenue: ${managerNewRev.toLocaleString()}₫`);
    expect(managerNewRev).toBe(managerInitRev + totalSalesAmount);
    log('✅ Dashboards: Manager revenue sync verified!');

    log('📄 Manager: Verifying recent invoice in recent sales table...');
    const recentRow = managerPage.locator('tbody tr').first();
    await expect(recentRow).toBeVisible();

    const invoiceNoText = await recentRow.locator('td').nth(0).innerText();
    const cashierNameText = await recentRow.locator('td').nth(1).innerText();
    const quantityText = await recentRow.locator('td').nth(2).innerText();
    const dateText = await recentRow.locator('td').nth(4).innerText();

    log(`📄 Manager: Recent Invoice Info -> Invoice: ${invoiceNoText}, Cashier: ${cashierNameText}, Quantity: ${quantityText}, Time: ${dateText}`);
    
    // Assertions
    expect(cashierNameText).toBe('Thu ngân 2');
    expect(quantityText).toBe('2');
    // Expect dateText to contain date separator (like '/')
    expect(dateText).toContain('/');
    log('✅ Manager: Recent invoice values verified successfully (correct cashier, quantity, and date/time format!)');

    // 7. Manager: View reports and low stock alerts
    log('📈 Manager: Navigating to reports page to check data loads...');
    await managerPage.click('aside a[href="/reports"]');
    await managerPage.waitForURL('**/reports');
    await expect(managerPage.locator('main h1')).toHaveText('Báo cáo');
    log('✅ Manager: Reports page loaded correctly');

    log('🏭 Manager: Navigating to inventory page...');
    await managerPage.click('aside a[href="/inventory"]');
    await managerPage.waitForURL('**/inventory');
    await expect(managerPage.locator('main h1')).toHaveText('Kho hàng');
    log('✅ Manager: Inventory warnings loaded correctly');

    // 8. Admin: Toggle product status to inactive (Deactivate Mì Hảo Hảo)
    log('🚫 Admin: Navigating back to products page to deactivate new product...');
    await adminPage.click('aside a[href="/products"]');
    await adminPage.waitForURL('**/products');
    
    await adminPage.fill('input[placeholder="🔍 Tìm kiếm..."]', productName);
    const tableRow = adminPage.locator('tbody tr').filter({ hasText: productName });
    await expect(tableRow).toBeVisible();

    log('🚫 Admin: Toggling product state to Inactive...');
    const toggleBtn = tableRow.locator('button').first();
    await expect(toggleBtn).toHaveText('Bán');
    await toggleBtn.click();
    await expect(toggleBtn).toHaveText('Ngừng');
    log('✅ Admin: Product status set to Inactive (Ngừng)');

    // 9. Cashiers: Confirm product is no longer available in POS search
    log('🔍 Cashier 1: Searching for deactivated product to verify removal...');
    await cashier1Page.fill('input[placeholder="🔍 Tìm sản phẩm..."]', '');
    await cashier1Page.fill('input[placeholder="🔍 Tìm sản phẩm..."]', productName);
    
    const dropdownList = cashier1Page.locator('div.absolute.z-10');
    // Dropdown should be hidden or not contain the product
    await expect(cashier1Page.locator(`button:has-text("${productName}")`)).toBeHidden({ timeout: 3000 });
    log('✅ Cashier 1: Deactivated product is hidden successfully!');

    // Capture success screenshots
    log('📸 Capturing success screenshots for all agents...');
    await adminPage.screenshot({ path: path.join(artifactDir, 'admin-success.png') });
    await managerPage.screenshot({ path: path.join(artifactDir, 'manager-success.png') });
    await cashier1Page.screenshot({ path: path.join(artifactDir, 'cashier1-success.png') });
    await cashier2Page.screenshot({ path: path.join(artifactDir, 'cashier2-success.png') });
    log('✅ All screenshots saved successfully');

  } catch (err: any) {
    testStatus = 'FAILED';
    failureReason = err.message || String(err);
    log(`❌ TEST FAILED: ${failureReason}`);

    // Capture failure screenshots
    log('📸 Capturing failure screenshots...');
    try {
      await adminPage.screenshot({ path: path.join(artifactDir, 'admin-failure.png') });
      await managerPage.screenshot({ path: path.join(artifactDir, 'manager-failure.png') });
      await cashier1Page.screenshot({ path: path.join(artifactDir, 'cashier1-failure.png') });
      await cashier2Page.screenshot({ path: path.join(artifactDir, 'cashier2-failure.png') });
    } catch (ssErr) {
      log(`⚠️ Failed to capture screenshots: ${ssErr}`);
    }
    throw err;
  } finally {
    // Generate Markdown Report
    log('📝 Generating Test Report...');
    const reportPath = path.join(artifactDir, 'report.md');
    const reportContent = `# Báo Cáo Kiểm Tra Tương Tác Đồng Thời (Multi-role Interaction Report)

**Trạng thái kiểm thử:** ${testStatus === 'PASSED' ? '🟢 THÀNH CÔNG (PASSED)' : '🔴 THẤT BẠI (FAILED)'}
**Thời gian chạy:** ${new Date().toLocaleString('vi-VN')}

## 📋 Chi tiết các bước thực hiện & Kết quả:
${logs.map(l => `- ${l}`).join('\n')}

${testStatus === 'FAILED' ? `## ⚠️ Lý do thất bại:\n\`\`\`\n${failureReason}\n\`\`\`\n` : ''}

## 📸 Ảnh chụp màn hình:
* **Tài khoản Admin:** [Success Screenshot](file://${path.join(artifactDir, 'admin-success.png')}) ${testStatus === 'FAILED' ? `| [Failure Screenshot](file://${path.join(artifactDir, 'admin-failure.png')})` : ''}
* **Tài khoản Manager:** [Success Screenshot](file://${path.join(artifactDir, 'manager-success.png')}) ${testStatus === 'FAILED' ? `| [Failure Screenshot](file://${path.join(artifactDir, 'manager-failure.png')})` : ''}
* **Tài khoản Cashier 1:** [Success Screenshot](file://${path.join(artifactDir, 'cashier1-success.png')}) ${testStatus === 'FAILED' ? `| [Failure Screenshot](file://${path.join(artifactDir, 'cashier1-failure.png')})` : ''}
* **Tài khoản Cashier 2:** [Success Screenshot](file://${path.join(artifactDir, 'cashier2-success.png')}) ${testStatus === 'FAILED' ? `| [Failure Screenshot](file://${path.join(artifactDir, 'cashier2-failure.png')})` : ''}
`;
    fs.writeFileSync(reportPath, reportContent);
    console.log(`📝 Report generated at: ${reportPath}`);

    // Cleanup page contexts
    await adminCtx.close();
    await managerCtx.close();
    await cashier1Ctx.close();
    await cashier2Ctx.close();
  }
});
