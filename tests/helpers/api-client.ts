import { request, APIRequestContext } from '@playwright/test';

const BASE = 'http://127.0.0.1:3333';

export interface UserCreds {
  email: string;
  password: string;
  role: string;
  name: string;
}

export const TEST_USERS: Record<string, UserCreds> = {
  admin:    { email: 'admin@pos.com',     password: 'password123', role: 'SUPER_ADMIN', name: 'Super Admin' },
  owner:    { email: 'owner@pos.com',     password: 'password123', role: 'OWNER',       name: 'Chủ cửa hàng' },
  manager:  { email: 'manager@pos.com',   password: 'password123', role: 'BRANCH_MANAGER', name: 'Quản lý chi nhánh' },
  cashier1: { email: 'cashier1@pos.com',  password: 'password123', role: 'CASHIER',     name: 'Thu ngân 1' },
  cashier2: { email: 'cashier2@pos.com',  password: 'password123', role: 'CASHIER',     name: 'Thu ngân 2' },
  inventory:{ email: 'inventory@pos.com', password: 'password123', role: 'INVENTORY_STAFF', name: 'Nhân viên kho' },
};

/**
 * Login & return { api, token, user }
 */
export async function loginUser(role: keyof typeof TEST_USERS): Promise<{
  api: APIRequestContext;
  token: string;
  user: UserCreds;
  branchId: string;
}> {
  const ctx = await request.newContext({ baseURL: BASE });
  const creds = TEST_USERS[role];

  const res = await ctx.post('/api/auth/login', { data: { email: creds.email, password: creds.password } });
  const body = await res.json();

  if (!res.ok()) throw new Error(`Login ${role} failed: ${JSON.stringify(body)}`);

  return {
    api: ctx,
    token: body.accessToken,
    user: creds,
    branchId: body.user.branchId,
  };
}

/**
 * API helpers attached to context
 */
export function api(ctx: APIRequestContext, token: string) {
  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };

  return {
    get:    (path: string)                 => ctx.get(    `/api${path}`, { headers }),
    post:   (path: string, data?: any)     => ctx.post(   `/api${path}`, { headers, data }),
    patch:  (path: string, data?: any)     => ctx.patch(  `/api${path}`, { headers, data }),
    delete: (path: string)                 => ctx.delete( `/api${path}`, { headers }),
  };
}

/**
 * Assert response is HTTP 2xx
 */
export async function assertOk(res: any, label: string) {
  if (!res.ok()) {
    const body = await res.text();
    throw new Error(`${label} FAILED (${res.status()}): ${body.slice(0, 200)}`);
  }
  return res;
}

/**
 * Assert response is HTTP 4xx (expected error)
 */
export async function assertFail(res: any, label: string, expectedStatus = 400) {
  if (res.status() !== expectedStatus) {
    const body = await res.text();
    throw new Error(`${label}: expected ${expectedStatus}, got ${res.status()} — ${body.slice(0, 200)}`);
  }
  return res;
}
