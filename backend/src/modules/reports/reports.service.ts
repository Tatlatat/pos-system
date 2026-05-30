import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class ReportsService {
  private readonly logger = new Logger(ReportsService.name);

  constructor(private prisma: PrismaService) {}

  // ==========================================================================
  // UC-28: Daily Sales Report
  // ==========================================================================
  async getDailySalesReport(date?: string, branchId?: string, page = 1, limit = 50) {
    const targetDate = date ? new Date(date) : new Date();
    const startOfDay = new Date(targetDate);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(targetDate);
    endOfDay.setHours(23, 59, 59, 999);

    const where: any = {
      createdAt: { gte: startOfDay, lte: endOfDay },
      status: 'COMPLETED',
    };
    if (branchId) where.branchId = branchId;

    // Database aggregates for summary (no OOM risk, no JS reduce)
    type SummaryAgg = {
      totalRevenue: number | null;
      totalCost: number | null;
      totalItems: number | null;
      totalInvoices: number | null;
    };
    const summaryAgg = await this.prisma.$queryRaw<SummaryAgg[]>`
      SELECT 
        COALESCE(SUM(s."totalAmount"), 0)::float as "totalRevenue",
        COALESCE(SUM(si.cost), 0)::float as "totalCost",
        COALESCE(SUM(si.qty), 0)::int as "totalItems",
        COUNT(s.id)::int as "totalInvoices"
      FROM sales s
      LEFT JOIN (
        SELECT "saleId", SUM(quantity * "costPrice") as cost, SUM(quantity) as qty
        FROM sale_items
        GROUP BY "saleId"
      ) si ON s.id = si."saleId"
      WHERE s.status = 'COMPLETED'
        AND s."createdAt" >= ${startOfDay}
        AND s."createdAt" <= ${endOfDay}
        ${branchId ? Prisma.sql`AND s."branchId" = ${branchId}` : Prisma.empty}
    `;

    const totalRevenue = summaryAgg[0]?.totalRevenue || 0;
    const totalCost = summaryAgg[0]?.totalCost || 0;
    const totalItems = summaryAgg[0]?.totalItems || 0;
    const totalInvoices = summaryAgg[0]?.totalInvoices || 0;
    const totalProfit = totalRevenue - totalCost;

    // Payment breakdown aggregated in DB
    const paymentsRaw = await this.prisma.$queryRaw<any[]>`
      SELECT 
        p.method,
        COALESCE(SUM(p.amount), 0)::float as amount
      FROM payments p
      JOIN sales s ON p."saleId" = s.id
      WHERE s.status = 'COMPLETED'
        AND s."createdAt" >= ${startOfDay}
        AND s."createdAt" <= ${endOfDay}
        ${branchId ? Prisma.sql`AND s."branchId" = ${branchId}` : Prisma.empty}
      GROUP BY p.method
    `;
    const paymentBreakdown: Record<string, number> = {};
    paymentsRaw.forEach(r => {
      paymentBreakdown[r.method] = r.amount;
    });

    const sales = await this.prisma.sale.findMany({
      where,
      include: {
        items: { select: { quantity: true, unitPrice: true, costPrice: true } },
        payments: true,
        cashier: { select: { id: true, fullName: true } },
        branch: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    });

    return {
      date: targetDate.toISOString().slice(0, 10),
      summary: {
        totalInvoices,
        totalItems,
        totalRevenue,
        totalCost,
        totalProfit,
        averageOrderValue: totalInvoices > 0 ? totalRevenue / totalInvoices : 0,
      },
      paymentBreakdown,
      sales,
      pagination: {
        page,
        limit,
        total: totalInvoices,
      },
    };
  }

  // ==========================================================================
  // UC-29: Product Sales Report (uses SQL aggregation, no OOM risk)
  // ==========================================================================
  async getProductSalesReport(
    startDate?: string,
    endDate?: string,
    branchId?: string,
    limit = 20,
  ) {
    const now = new Date();
    // Default to last 365 days if no date cap provided to avoid OOM
    const capStartDate = startDate ? new Date(startDate) : new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
    const capEndDate = (() => {
      if (!endDate) return new Date();
      const d = new Date(endDate);
      if (isNaN(d.getTime())) return new Date();
      d.setHours(23, 59, 59, 999);
      return d;
    })();

    // Raw SQL LEFT JOIN aggregates to include active products with 0 sales (accurate slowMoving list)
    // and correctly calculate totalCost based on unitCost * quantity sold (resolves Bug D & Bug E)
    const rawResults = await this.prisma.$queryRaw<any[]>`
      SELECT 
        p.id as "productId",
        p.sku,
        p.name,
        p.barcode,
        c.name as category,
        COALESCE(SUM(si.quantity), 0)::int as "totalQty",
        COALESCE(SUM(si.quantity * si."unitPrice"), 0)::float as "totalRevenue",
        COALESCE(SUM(si.quantity * si."costPrice"), 0)::float as "totalCost",
        (COALESCE(SUM(si.quantity * si."unitPrice"), 0) - COALESCE(SUM(si.quantity * si."costPrice"), 0))::float as "totalProfit"
      FROM products p
      JOIN categories c ON p."categoryId" = c.id
      LEFT JOIN (
        SELECT si_sub."productId", si_sub.quantity, si_sub."unitPrice", si_sub."costPrice"
        FROM sale_items si_sub
        JOIN sales s_sub ON si_sub."saleId" = s_sub.id
        WHERE s_sub.status = 'COMPLETED'
          AND s_sub."createdAt" >= ${capStartDate}
          AND s_sub."createdAt" <= ${capEndDate}
          ${branchId ? Prisma.sql`AND s_sub."branchId" = ${branchId}` : Prisma.empty}
      ) si ON p.id = si."productId"
      WHERE p."isActive" = true
      GROUP BY p.id, p.sku, p.name, p.barcode, c.name
    `;

    const sortedByQtyDesc = [...rawResults].sort((a, b) => b.totalQty - a.totalQty);
    const sortedByQtyAsc = [...rawResults].sort((a, b) => a.totalQty - b.totalQty);

    const summary = rawResults.reduce((s, p) => ({
      totalProducts: s.totalProducts + (p.totalQty > 0 ? 1 : 0),
      totalSold: s.totalSold + p.totalQty,
      totalRevenue: s.totalRevenue + p.totalRevenue,
      totalProfit: s.totalProfit + p.totalProfit,
    }), { totalProducts: 0, totalSold: 0, totalRevenue: 0, totalProfit: 0 });

    return {
      topSelling: sortedByQtyDesc.slice(0, +limit),
      slowMoving: sortedByQtyAsc.slice(0, +limit),
      summary,
    };
  }

  // ==========================================================================
  // UC-30: Inventory Valuation Report
  // ==========================================================================
  async getInventoryValuation(branchId?: string, page = 1, limit = 50) {
    // DB aggregate for summary statistics (avoids JS reduce / OOM)
    const summaryAgg = await this.prisma.$queryRaw<any[]>`
      SELECT 
        COUNT(DISTINCT s."productId")::int as "totalProducts",
        COALESCE(SUM(s.quantity), 0)::int as "totalQuantity",
        COALESCE(SUM(s.quantity * p."costPrice"), 0)::float as "totalCostValue",
        COALESCE(SUM(s.quantity * p."sellingPrice"), 0)::float as "totalRetailValue",
        COALESCE(SUM(s.quantity * (p."sellingPrice" - p."costPrice")), 0)::float as "totalPotentialProfit"
      FROM inventory_stocks s
      JOIN products p ON s."productId" = p.id
      WHERE p."isActive" = true
        ${branchId ? Prisma.sql`AND s."branchId" = ${branchId}` : Prisma.empty}
    `;

    // DB aggregate for category breakdown
    const categoryRaw = await this.prisma.$queryRaw<any[]>`
      SELECT 
        c.name as category,
        COALESCE(SUM(s.quantity), 0)::int as quantity,
        COALESCE(SUM(s.quantity * p."costPrice"), 0)::float as "totalCost",
        COALESCE(SUM(s.quantity * p."sellingPrice"), 0)::float as "totalRetail"
      FROM inventory_stocks s
      JOIN products p ON s."productId" = p.id
      JOIN categories c ON p."categoryId" = c.id
      WHERE p."isActive" = true
        ${branchId ? Prisma.sql`AND s."branchId" = ${branchId}` : Prisma.empty}
      GROUP BY c.name
    `;

    const totalItems = await this.prisma.inventoryStock.count({
      where: {
        product: { isActive: true },
        ...(branchId ? { branchId } : {}),
      },
    });

    const stocks = await this.prisma.inventoryStock.findMany({
      where: {
        product: { isActive: true },
        ...(branchId ? { branchId } : {}),
      },
      include: {
        product: {
          select: {
            id: true, sku: true, name: true, barcode: true, costPrice: true, sellingPrice: true, unit: true,
            category: { select: { name: true } },
          },
        },
        branch: { select: { name: true } },
      },
      skip: (page - 1) * limit,
      take: limit,
    });

    const items = stocks.map((s) => ({
      productId: s.product.id,
      sku: s.product.sku,
      productName: s.product.name,
      category: s.product.category.name,
      unit: s.product.unit,
      quantity: s.quantity,
      costPrice: Number(s.product.costPrice),
      sellingPrice: Number(s.product.sellingPrice),
      totalCost: Number(s.product.costPrice) * s.quantity,
      totalRetail: Number(s.product.sellingPrice) * s.quantity,
      potentialProfit: (Number(s.product.sellingPrice) - Number(s.product.costPrice)) * s.quantity,
      branch: s.branch.name,
    }));

    return {
      items,
      categoryBreakdown: categoryRaw,
      summary: {
        totalProducts: summaryAgg[0]?.totalProducts || 0,
        totalQuantity: summaryAgg[0]?.totalQuantity || 0,
        totalCostValue: summaryAgg[0]?.totalCostValue || 0,
        totalRetailValue: summaryAgg[0]?.totalRetailValue || 0,
        totalPotentialProfit: summaryAgg[0]?.totalPotentialProfit || 0,
      },
      pagination: {
        page,
        limit,
        total: totalItems,
      },
    };
  }

  // ==========================================================================
  // UC-31: Profit Report (Revenue - COGS = Profit)
  // ==========================================================================
  async getProfitReport(startDate?: string, endDate?: string, branchId?: string) {
    const now = new Date();
    // Default to last 365 days if no date cap provided to avoid OOM (resolves Bug NEW-2)
    const capStartDate = startDate ? new Date(startDate) : new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
    const capEndDate = (() => {
      if (!endDate) return new Date();
      const d = new Date(endDate);
      if (isNaN(d.getTime())) return new Date();
      d.setHours(23, 59, 59, 999);
      return d;
    })();

    // PostgreSQL aggregate via Raw SQL (avoids findMany + JS reduce OOM)
    // Uses subquery join to prevent duplicate calculations on multi-item sales
    const rawDaily = await this.prisma.$queryRaw<any[]>`
      SELECT 
        s."createdAt"::date as date,
        COALESCE(SUM(s."totalAmount"), 0)::float as revenue,
        COALESCE(SUM(si.cost), 0)::float as cost,
        COUNT(s.id)::int as count
      FROM sales s
      LEFT JOIN (
        SELECT "saleId", SUM(quantity * "costPrice") as cost
        FROM sale_items
        GROUP BY "saleId"
      ) si ON s.id = si."saleId"
      WHERE s.status = 'COMPLETED'
        AND s."createdAt" >= ${capStartDate}
        AND s."createdAt" <= ${capEndDate}
        ${branchId ? Prisma.sql`AND s."branchId" = ${branchId}` : Prisma.empty}
      GROUP BY s."createdAt"::date
      ORDER BY date ASC
    `;

    const daily = rawDaily.map((r) => {
      const revenue = r.revenue;
      const cost = r.cost;
      const profit = revenue - cost;
      const dateStr = new Date(r.date).toISOString().slice(0, 10);
      return {
        date: dateStr,
        revenue,
        cost,
        profit,
        count: r.count,
        margin: revenue > 0 ? ((profit / revenue) * 100).toFixed(2) + '%' : '0%',
      };
    });

    const totalRevenue = daily.reduce((sum, d) => sum + d.revenue, 0);
    const totalCost = daily.reduce((sum, d) => sum + d.cost, 0);
    const totalProfit = daily.reduce((sum, d) => sum + d.profit, 0);

    return {
      daily,
      summary: {
        period: {
          start: startDate || daily[0]?.date || capStartDate.toISOString().slice(0, 10),
          end: endDate || daily[daily.length - 1]?.date || capEndDate.toISOString().slice(0, 10),
          days: daily.length,
        },
        totalRevenue,
        totalCost,
        totalProfit,
        totalInvoices: daily.reduce((sum, d) => sum + d.count, 0),
        profitMargin: totalRevenue > 0 ? ((totalProfit / totalRevenue) * 100).toFixed(2) + '%' : '0%',
      },
    };
  }

  // ==========================================================================
  // UC-32: Cashier Performance
  // ==========================================================================
  async getCashierPerformance(startDate?: string, endDate?: string, branchId?: string) {
    const now = new Date();
    // Default to last 365 days if no date cap provided to avoid OOM
    const capStartDate = startDate ? new Date(startDate) : new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
    const capEndDate = (() => {
      if (!endDate) return new Date();
      const d = new Date(endDate);
      if (isNaN(d.getTime())) return new Date();
      d.setHours(23, 59, 59, 999);
      return d;
    })();

    // Aggregate by cashier in DB via Raw SQL (avoids findMany + JS reduce OOM)
    const rawCashiers = await this.prisma.$queryRaw<any[]>`
      SELECT 
        u.id as "cashierId",
        u."fullName" as "cashierName",
        u.email,
        b.name as branch,
        COUNT(s.id)::int as "totalSales",
        COALESCE(SUM(s."totalAmount"), 0)::float as "totalRevenue",
        COALESCE(SUM(si.qty), 0)::int as "totalItems"
      FROM users u
      JOIN sales s ON u.id = s."cashierId"
      JOIN branches b ON s."branchId" = b.id
      LEFT JOIN (
        SELECT "saleId", SUM(quantity) as qty
        FROM sale_items
        GROUP BY "saleId"
      ) si ON s.id = si."saleId"
      WHERE s.status = 'COMPLETED'
        AND s."createdAt" >= ${capStartDate}
        AND s."createdAt" <= ${capEndDate}
        ${branchId ? Prisma.sql`AND s."branchId" = ${branchId}` : Prisma.empty}
      GROUP BY u.id, u."fullName", u.email, b.name
      ORDER BY "totalRevenue" DESC
    `;

    const cashiers = rawCashiers.map(c => ({
      ...c,
      avgOrderValue: c.totalSales > 0 ? c.totalRevenue / c.totalSales : 0,
    }));

    return {
      cashiers,
      summary: {
        totalCashiers: cashiers.length,
        totalSales: cashiers.reduce((sum, c) => sum + c.totalSales, 0),
        totalRevenue: cashiers.reduce((sum, c) => sum + c.totalRevenue, 0),
      },
    };
  }
}
