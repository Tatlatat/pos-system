import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class DashboardService {
  constructor(private prisma: PrismaService) {}

  async getDashboardSummary(branchId?: string) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const branchFilter = branchId ? { branchId } : {};

    // Today's sales
    const todaySales = await this.prisma.sale.aggregate({
      where: {
        ...branchFilter,
        createdAt: { gte: today },
        status: 'COMPLETED',
      },
      _sum: { totalAmount: true },
      _count: true,
    });

    // Total inventory value, retail value, low stock count, and total products count
    // aggregated inside database to prevent OOM crash (avoids loading entire table into RAM)
    type StockAggRow = {
      inventoryValue: number | null;
      retailValue: number | null;
      lowStockCount: number | null;
      totalProducts: number | null;
    };
    const stockAgg = await this.prisma.$queryRaw<StockAggRow[]>`
      SELECT 
        COALESCE(SUM(s.quantity * p."costPrice"), 0)::float as "inventoryValue",
        COALESCE(SUM(s.quantity * p."sellingPrice"), 0)::float as "retailValue",
        COUNT(CASE WHEN p."minStock" > 0 AND s.quantity <= p."minStock" THEN 1 END)::int as "lowStockCount",
        COUNT(DISTINCT s."productId")::int as "totalProducts"
      FROM inventory_stocks s
      JOIN products p ON s."productId" = p.id
      WHERE p."isActive" = true
        ${branchId ? Prisma.sql`AND s."branchId" = ${branchId}` : Prisma.empty}
    `;

    const inventoryValue = stockAgg[0]?.inventoryValue || 0;
    const retailValue = stockAgg[0]?.retailValue || 0;
    const lowStockValue = stockAgg[0]?.lowStockCount || 0;
    const totalProducts = stockAgg[0]?.totalProducts || 0;

    // Active cashiers
    const activeCashiers = await this.prisma.user.count({
      where: {
        role: 'CASHIER',
        isActive: true,
        ...(branchId ? { branchId } : {}),
      },
    });

    // Recent sales
    const recentSalesRaw = await this.prisma.sale.findMany({
      where: { ...branchFilter, status: 'COMPLETED' },
      take: 10,
      orderBy: { createdAt: 'desc' },
      include: {
        cashier: { select: { fullName: true } },
        items: { select: { quantity: true } },
      },
    });

    const recentSales = recentSalesRaw.map(sale => {
      const { items, ...rest } = sale;
      const totalQty = items.reduce((sum, item) => sum + item.quantity, 0);
      return {
        ...rest,
        totalQuantity: totalQty,
      };
    });

    // Today's revenue by hour
    type HourlyRow = { hour: number; count: bigint; revenue: number | null };
    const rawHourly = await this.prisma.$queryRaw<HourlyRow[]>`
      SELECT
        EXTRACT(HOUR FROM "createdAt")::int as hour,
        COUNT(*)::int as count,
        COALESCE(SUM("totalAmount"), 0) as revenue
      FROM sales
      WHERE "createdAt" >= ${today}
        AND "status" = 'COMPLETED'::"SaleStatus"
        ${branchId ? Prisma.sql`AND "branchId" = ${branchId}` : Prisma.empty}
      GROUP BY EXTRACT(HOUR FROM "createdAt")
      ORDER BY hour
    `;

    const invoiceCount = typeof todaySales._count === 'number' ? todaySales._count : (todaySales._count as any)?._all || 0;
    // Normalize Decimal/bigint values from raw query to numbers
    const hourlySales = (rawHourly || []).map(r => ({
      hour: r.hour,
      count: Number(r.count),
      revenue: Number(r.revenue) || 0,
    }));

    return {
      today: {
        revenue: todaySales._sum.totalAmount || 0,
        invoiceCount,
        averageOrderValue: invoiceCount > 0
          ? Number(todaySales._sum.totalAmount) / invoiceCount
          : 0,
      },
      inventory: {
        totalValue: inventoryValue,
        retailValue,
        lowStockCount: lowStockValue,
        totalProducts,
      },
      operations: {
        activeCashiers,
      },
      recentSales,
      hourlyRevenue: hourlySales,
    };
  }
}
