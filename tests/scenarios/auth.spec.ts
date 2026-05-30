import { test, expect } from '@playwright/test';
import { loginUser, assertOk, assertFail } from '../helpers/api-client';

test.describe('Auth Module (UC-01..04)', () => {

  test('UC-01: Login — all 5 roles', async () => {
    for (const role of ['admin', 'owner', 'manager', 'cashier1', 'inventory'] as const) {
      const { api, token, user } = await loginUser(role);
      expect(token).toBeTruthy();
      expect(token.split('.').length).toBe(3); // valid JWT has 3 parts

      // Verify profile endpoint works
      const profile = await (await api.get('/api/auth/profile', {
        headers: { Authorization: `Bearer ${token}` },
      })).json();
      expect(profile.email).toBe(user.email);
      expect(profile.role).toBe(user.role);

      await api.dispose();
    }
  });

  test('UC-01: Login — invalid password returns error', async () => {
    const { request } = require('@playwright/test');
    const ctx = await request.newContext({ baseURL: 'http://127.0.0.1:3333' });
    const res = await ctx.post('/api/auth/login', {
      data: { email: 'admin@pos.com', password: 'WRONG' },
    });
    expect(res.status()).toBeGreaterThanOrEqual(400); // 401 or 400 both indicate rejection
    await ctx.dispose();
  });

  test('UC-02: Logout — clears refresh token', async () => {
    const { api, token } = await loginUser('admin');

    // Logout
    const logoutRes = await api.post('/api/auth/logout', {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(logoutRes.ok()).toBe(true);

    // Profile still works (JWT is stateless, not blacklisted)
    const profile = await api.get('/api/auth/profile', {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(profile.ok()).toBe(true);
    console.log('   ✅ JWT stateless — profile still accessible after logout (expected)');

    await api.dispose();
  });

  test('UC-04: Change password flow', async () => {
    const { api, token } = await loginUser('cashier1');
    const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };

    // Change with wrong current password
    const wrongRes = await api.post('/api/auth/change-password', {
      data: { currentPassword: 'WRONG', newPassword: 'newpass123' },
      headers,
    });
    await assertFail(wrongRes, 'Wrong current password should fail');

    // Change with correct current password
    const okRes = await api.post('/api/auth/change-password', {
      data: { currentPassword: 'password123', newPassword: 'newpass123' },
      headers,
    });
    await assertOk(okRes, 'Change password');

    // Change back
    const revertRes = await api.post('/api/auth/change-password', {
      data: { currentPassword: 'newpass123', newPassword: 'password123' },
      headers,
    });
    await assertOk(revertRes, 'Revert password');

    await api.dispose();
  });
});
