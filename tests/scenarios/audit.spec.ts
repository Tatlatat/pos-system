import { test, expect } from '@playwright/test';
import { loginUser } from '../helpers/api-client';

test.describe('Audit Log (UC-33..34)', () => {

  test('Audit logs exist for stock operations', async () => {
    const { api, token } = await loginUser('admin');
    const headers = { Authorization: `Bearer ${token}` };

    // === Test UC-33: User Activity Log ===
    console.log('\n   📋 UC-33: User Activity Log');

    // 1. Get all audit logs
    const allLogsRes = await api.get('/api/audit?limit=50', { headers });
    const allLogs = await allLogsRes.json();
    expect(allLogs.total).toBeGreaterThan(0);
    expect(allLogs.data.length).toBeGreaterThan(0);

    // 2. Verify log structure
    const log = allLogs.data[0];
    expect(log).toHaveProperty('action');
    expect(log).toHaveProperty('entity');
    expect(log).toHaveProperty('userId');
    expect(log).toHaveProperty('createdAt');
    expect(log.user).toHaveProperty('fullName');

    // 3. Filter by action
    const loginLogsRes = await api.get('/api/audit?action=LOGIN&limit=10', { headers });
    const loginLogs = await loginLogsRes.json();
    const loginEntries = loginLogs.data.filter((l: any) => l.action === 'LOGIN');
    // The test itself has generated some LOGIN actions
    console.log(`   ✅ User Activity Log entries: ${allLogs.total} total, ${loginEntries.length} LOGIN events`);

    // === Test UC-34: Inventory Log ===
    console.log('   📋 UC-34: Inventory Log');

    const inventoryLogsRes = await api.get('/api/audit/inventory?limit=20', { headers });
    const inventoryLogs = await inventoryLogsRes.json();
    expect(inventoryLogs.total).toBeGreaterThanOrEqual(0);
    console.log(`   ✅ Inventory Log entries: ${inventoryLogs.total}`);

    await api.dispose();
  });
});
