# 🏪 POS & Inventory Management System

[![NestJS](https://img.shields.io/badge/NestJS-E0234E?style=flat&logo=nestjs&logoColor=white)](https://nestjs.com)
[![Next.js](https://img.shields.io/badge/Next.js-000000?style=flat&logo=nextdotjs&logoColor=white)](https://nextjs.org)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-4169E1?style=flat&logo=postgresql&logoColor=white)](https://postgresql.org)
[![Redis](https://img.shields.io/badge/Redis-DC382D?style=flat&logo=redis&logoColor=white)](https://redis.io)
[![Docker](https://img.shields.io/badge/Docker-2496ED?style=flat&logo=docker&logoColor=white)](https://docker.com)
[![Prisma](https://img.shields.io/badge/Prisma-2D3748?style=flat&logo=prisma&logoColor=white)](https://prisma.io)
[![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?style=flat&logo=typescript&logoColor=white)](https://typescriptlang.org)

An **enterprise-grade Point of Sale and Inventory Management System** built for retail chains and minimarts. Multi-branch, multi-role, real-time — designed for production workloads with concurrency safety and audit compliance.

---

## ✨ Features

| Module | Capabilities |
|--------|-------------|
| **🔐 Auth** | JWT access + refresh tokens, RBAC (5 roles), password reset, change password |
| **📦 Products** | CRUD, SKU/Barcode, search, category management, soft-delete, min-stock alerts |
| **📊 Inventory** | Stock In/Out, adjustments, branch transfers, low-stock alerts with `minStock` comparison |
| **🛒 POS** | Cart management, barcode scanning, checkout (cash/bank/e-wallet), returns, invoice cancellation, receipt generation |
| **📋 Procurement** | Purchase Order (create → approve → reject), goods receipt → auto stock-in |
| **👥 Customers** | CRM, purchase history, loyalty points system |
| **📈 Reports** | Daily sales, product performance (top-selling & slow-moving), inventory valuation, profit analysis (revenue − COGS), cashier performance |
| **📜 Audit** | Immutable activity ledger, inventory transaction trail |
| **📊 Dashboard** | Real-time KPIs via WebSocket (revenue, low stock, recent sales) |

### 👮 Role-Based Access Control

| Role | Permissions |
|------|-----------|
| **Super Admin** | Full system access, all branches, user management |
| **Owner** | View reports & dashboards across all branches |
| **Branch Manager** | Branch-scoped management, approve POs, cancel invoices |
| **Cashier** | POS operations (cart → checkout → return) |
| **Inventory Staff** | Stock In/Out, adjustments, transfers |

---

## 🏗 Architecture

```
┌─────────────────────────────────────────────────────┐
│                   Frontend (Next.js)                  │
│  Pages Router · Tailwind · Auth Context · Axios      │
└──────────────┬──────────────────────┬────────────────┘
               │ HTTP REST /api/*     │ WebSocket /dashboard
               ▼                      ▼
┌─────────────────────────────────────────────────────┐
│                  Backend (NestJS)                     │
│  Modules · Guards · Interceptors · Gateway            │
│  Passport (JWT) · Class-validator · Swagger          │
└──────────────┬──────────────────────┬────────────────┘
               │ Prisma ORM           │ ioredis
               ▼                      ▼
┌─────────────────────┐   ┌─────────────────────────┐
│    PostgreSQL 16     │   │  Redis (sessions/cache) │
│  (primary database)  │   │  (token blacklist)      │
└─────────────────────┘   └─────────────────────────┘
```

### Concurrency Safety 🔒

The system uses **Repeatable Read isolation** + atomic `updateMany` guards to prevent:
- **Double-checkout**: cart deactivation is atomic — only the first concurrent request wins
- **Negative stock**: every stock decrement uses `WHERE quantity >= N` guard
- **Double-refund**: cumulative return tracking prevents refunding more than sold
- **PO overshoot**: `receivedQty + new <= ordered` is checked via atomic SQL
- **Loyalty race**: `GREATEST(0, total_points - N)` at the database level

---

## 🚀 Quick Start — Development

### Prerequisites

- Node.js 20+
- PostgreSQL 16 (running)
- Redis 7+

```bash
# 1. Clone repository
git clone https://github.com/Tatlatat/pos-system.git
cd pos-system

# 2. Install backend dependencies
cd backend
npm install
cp .env.example .env     # Edit .env with your DB credentials
npx prisma db push       # Create database tables
npx prisma db seed       # Seed demo data

# 3. Start backend (terminal 1)
npm run start:dev

# 4. Install and start frontend (terminal 2)
cd ../frontend
npm install
npm run dev

# 5. Open in browser
# Frontend: http://localhost:3000
# API docs: http://localhost:3333/api/docs
```

### Demo Credentials

| Role | Email | Password |
|------|-------|----------|
| Super Admin | `admin@pos.com` | `password123` |
| Branch Manager | `manager@pos.com` | `password123` |
| Cashier | `cashier1@pos.com` | `password123` |
| Owner | `owner@pos.com` | `password123` |
| Inventory Staff | `inventory@pos.com` | `password123` |

---

## 🐳 Quick Start — Production (Docker)

```bash
# 1. Set up environment
cp .env.example .env
# Edit: JWT_SECRET, JWT_REFRESH_SECRET, DATABASE_URL, REDIS_URL, CORS_ORIGIN

# 2. Build and start all services
docker compose -f docker-compose.prod.yml up -d

# 3. Seed database (first run only)
docker exec pos-backend npx prisma db seed

# 4. Access
# Frontend: https://yourdomain.com
# API docs: https://yourdomain.com/api/docs

# Utility commands
docker compose -f docker-compose.prod.yml logs -f    # View logs
docker compose -f docker-compose.prod.yml down       # Stop everything
docker compose -f docker-compose.prod.yml up -d --scale backend=3  # Scale horizontally
```

---

## 🔐 Security

- **JWT** access tokens (15 min) + refresh tokens (7 days) — no fallback secrets in code
- **RBAC guards** on every protected endpoint via NestJS `@Roles()` decorator
- **Password hashing** with bcrypt (10 rounds)
- **Helmet** security headers applied globally
- **Rate limiting** — 30 login attempts/min via `@nestjs/throttler`
- **Input validation** — `class-validator` DTOs with `@IsNotEmpty()` on all required fields
- **SQL injection** protection via Prisma parameterized queries
- **No sensitive files in git** — `.env`, `.env.production`, `backend/agy-*.py` all in `.gitignore`

---

## 📦 Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `DATABASE_URL` | ✅ | — | PostgreSQL connection string |
| `JWT_SECRET` | ✅ | — | Access token signing secret |
| `JWT_REFRESH_SECRET` | ✅ | — | Refresh token signing secret |
| `JWT_EXPIRES_IN` | ❌ | `15m` | Access token TTL |
| `JWT_REFRESH_EXPIRES_IN` | ❌ | `7d` | Refresh token TTL |
| `REDIS_URL` | ❌ | `redis://localhost:6379` | Redis connection string |
| `CORS_ORIGIN` | ❌ | `http://localhost:3000` | Allowed CORS origins (comma-separated) |
| `PORT` | ❌ | `3333` | Backend listening port |
| `NODE_ENV` | ❌ | `development` | `development` / `production` |

---

## 📚 API Documentation

Interactive Swagger docs are available at **`/api/docs`** when the backend is running.

- **Auth**: `POST /api/auth/login`, `POST /api/auth/refresh`, `POST /api/auth/change-password`, `POST /api/auth/request-reset`, `POST /api/auth/reset-password`
- **Products**: `GET/POST /api/products`, `GET /api/products/search`, `GET /api/products/barcode/:barcode`
- **Inventory**: `POST /api/inventory/stock-in`, `POST /api/inventory/stock-out`, `POST /api/inventory/transfer`, `GET /api/inventory/low-stock`
- **POS**: `GET/POST /api/pos/cart`, `POST /api/pos/cart/add`, `POST /api/pos/checkout`, `POST /api/pos/return`, `POST /api/pos/:id/cancel`
- **Procurement**: `POST /api/procurement/po`, `POST /api/procurement/po/:id/approve`, `POST /api/procurement/po/:id/reject`, `POST /api/procurement/receive`
- **Reports**: `GET /api/reports/daily-sales`, `GET /api/reports/product-sales`, `GET /api/reports/profit`, `GET /api/reports/cashier-performance`
- **Dashboard**: `GET /api/dashboard/stats` (WebSocket at `/dashboard` with JWT token)

---

## 📁 Project Structure

```
pos-system/
├── backend/                    # NestJS API server
│   ├── prisma/                 # Schema, migrations, seed
│   ├── src/
│   │   ├── common/             # Guards, decorators, filters
│   │   ├── modules/            # Feature modules
│   │   │   ├── auth/           # Authentication & authorization
│   │   │   ├── audit/          # Audit logging
│   │   │   ├── branches/       # Branch management
│   │   │   ├── categories/     # Product categories
│   │   │   ├── customers/      # Customer management
│   │   │   ├── dashboard/      # Dashboard + WebSocket gateway
│   │   │   ├── inventory/      # Stock operations
│   │   │   ├── pos/            # Point of sale (cart, checkout, returns)
│   │   │   ├── procurement/    # Purchase orders, goods receipt
│   │   │   ├── products/       # Product catalog
│   │   │   ├── reports/        # Business reports
│   │   │   ├── suppliers/      # Supplier management
│   │   │   └── users/          # User management
│   │   └── prisma/             # Prisma service module
│   └── tsconfig.json
├── frontend/                   # Next.js application
│   └── src/
│       ├── app/                # Pages (login, dashboard, pos, inventory, etc.)
│       ├── components/         # Shared components (Sidebar)
│       └── lib/                # API client, auth context, utilities
├── docker/                     # Dockerfiles + nginx config
├── tests/                      # Playwright integration + stress tests
│   ├── scenarios/              # Test scenarios by module
│   ├── helpers/                # API client helper
│   ├── run-all.js              # Test runner
│   └── stress-loop.js          # 6-iteration stress loop
├── docker-compose.yml          # Dev infrastructure (Postgres + Redis)
├── docker-compose.prod.yml     # Production deployment
└── .gitignore
```

---

## 🧪 Testing

```bash
# Run all Playwright tests
cd tests && npm install
npx playwright install chromium
node run-all.js

# Stress test (6 iterations)
node stress-loop.js
```

### Test Results

```
✓ 11/11 tests passing consistently
  - Auth: login (5 roles), logout, change password
  - Inventory: stock in, stock out, low stock alert, returns
  - Audit: user activity log, inventory log
  - Stress: 10 concurrent checkouts — no double invoice, no negative stock
  - Race: 2 cashiers competing for limited stock — only 1 winner
```

---

## 📄 License

[MIT](LICENSE) © 2024
