# Enterprise POS & Inventory Management System

Hệ thống Quản lý Bán hàng và Kho vận Doanh nghiệp cho chuỗi minimart.

## 🏗 Kiến trúc

```
Frontend (NextJS)  →  Backend (NestJS)  →  PostgreSQL
                         ↕
                   Redis (sessions)
```

## 📋 Tính năng

| Module | Chức năng |
|--------|-----------|
| **Auth** | Login/Logout, JWT, RBAC (5 roles), Change/Reset password |
| **Products** | CRUD, SKU/Barcode, Search, Category, Soft-delete |
| **Inventory** | Stock In/Out, Adjustment, Transfer, Low Stock Alert |
| **POS** | Cart, Barcode Scan, Checkout (Cash/Bank/E-Wallet), Receipt, Return, Cancel |
| **Procurement** | PO Create/Approve, Goods Receipt → Auto Stock In |
| **Customers** | CRUD, Purchase History, Loyalty Points |
| **Reports** | Daily Sales, Product Sales, Inventory Valuation, Profit, Cashier Performance |
| **Audit** | User Activity Log, Inventory Transaction Ledger |
| **Dashboard** | Real-time via WebSocket |

## 🚀 Quick Start

### Yêu cầu
- Docker & Docker Compose
- Node.js 20+ (cho development)

### Production (Docker)

```bash
# 1. Clone và cd vào project

# 2. Tạo .env từ template
cp .env.production .env
# Sửa .env: JWT_SECRET, JWT_REFRESH_SECRET, DOMAIN

# 3. Build và chạy
docker compose -f docker-compose.prod.yml up -d

# 4. Seed database (chạy 1 lần)
docker exec pos-backend npx prisma db seed

# 5. Truy cập
# https://yourdomain.com  — Frontend
# https://yourdomain.com/api/docs  — Swagger API docs
```

### Development

```bash
# 1. Install dependencies
cd backend && npm install
cd ../frontend && npm install

# 2. Setup database (cần PostgreSQL chạy)
cd backend
cp ../.env.production .env
npx prisma db push
npx prisma db seed

# 3. Start backend
npm run start:dev

# 4. Start frontend (terminal khác)
cd frontend
npm run dev

# 5. Truy cập
# http://localhost:3000  — Frontend
# http://localhost:3001/api/docs  — Swagger API docs
```

### Test

```bash
# Chạy Playwright stress test
cd tests
npm install
npx playwright install chromium
node run-all.js

# Stress loop 6 iterations
node stress-loop.js
```

## 👥 Actors & Permissions

| Role | Quyền |
|------|-------|
| **Super Admin** | Toàn quyền hệ thống |
| **Owner** | Xem báo cáo, dashboard |
| **Branch Manager** | Quản lý chi nhánh, duyệt PO, cancel invoice |
| **Cashier** | POS bán hàng |
| **Inventory Staff** | Quản lý kho, nhập/xuất/kiểm kê |

## 🔐 Security

- JWT access + refresh token (không fallback secrets)
- RBAC guards trên mọi endpoint
- Password bcrypt hash
- Helmet security headers
- Rate limiting (nginx)
- Non-negative stock constraint
- Pessimistic locking cho concurrent checkout
- Immutable inventory transaction ledger

## 🐳 Docker Production

```bash
# Build images
docker compose -f docker-compose.prod.yml build

# Start
docker compose -f docker-compose.prod.yml up -d

# Scale backend (horizontal)
docker compose -f docker-compose.prod.yml up -d --scale backend=3

# View logs
docker compose -f docker-compose.prod.yml logs -f

# Stop
docker compose -f docker-compose.prod.yml down
```

## 📊 Load Test Results

```
11 tests, 11 passed ✓
10 concurrent cashiers → no double-checkout, no negative stock
2 cashiers race condition → only 1 winner, stock correct
```

## 📝 License

MIT
