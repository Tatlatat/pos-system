import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import {
  StockInDto,
  StockOutDto,
  StockAdjustmentDto,
  TransferDto,
} from './dto/stock-in.dto';

@Injectable()
export class InventoryService {
  private readonly logger = new Logger(InventoryService.name);

  constructor(
    private prisma: PrismaService,
    private auditService: AuditService,
  ) {}

  // ==========================================================================
  // UC-11: Stock In — Nhập kho
  // ==========================================================================
  async stockIn(dto: StockInDto, branchId: string, userId: string) {
    const result = await this.prisma.$transaction(async (tx) => {
      const stock = await tx.inventoryStock.findUnique({
        where: { productId_branchId: { productId: dto.productId, branchId } },
      });

      if (!stock) {
        throw new NotFoundException('Product not found in this branch inventory');
      }

      const updatedStock = await tx.inventoryStock.update({
        where: { id: stock.id },
        data: { quantity: { increment: dto.quantity } },
      });

      await tx.inventoryTransaction.create({
        data: {
          type: 'STOCK_IN', quantity: dto.quantity,
          reference: dto.reference, note: dto.note,
          productId: dto.productId, branchId, userId,
        },
      });

      return { previousStock: stock.quantity, newStock: updatedStock.quantity, change: dto.quantity };
    });

    this.logger.log(`Stock In: +${dto.quantity} for product ${dto.productId} at branch ${branchId}`);
    this.auditService.log({
      userId, action: 'STOCK_IN', entity: 'Inventory', entityId: dto.productId,
      newValue: { quantity: dto.quantity, newStock: result.newStock, reference: dto.reference },
    }).catch(e => this.logger.error('Audit log failed', e));
    return result;
  }

  // ==========================================================================
  // UC-12: Stock Out — Xuất kho (hỏng, mất)
  // ==========================================================================
  async stockOut(dto: StockOutDto, branchId: string, userId: string) {
    const result = await this.prisma.$transaction(async (tx) => {
      // Atomic decrement with guard — DB rejects if insufficient stock
      // Prevents TOCTOU even between findUnique and update
      const stock = await tx.inventoryStock.findUnique({
        where: { productId_branchId: { productId: dto.productId, branchId } },
      });
      if (!stock) throw new NotFoundException('Product not found in this branch');

      const updated = await tx.inventoryStock.updateMany({
        where: { id: stock.id, quantity: { gte: dto.quantity } },
        data: { quantity: { decrement: dto.quantity } },
      });
      if (updated.count === 0) {
        throw new BadRequestException(
          `Insufficient stock. Current: ${stock.quantity}, Requested: ${dto.quantity}`,
        );
      }

      await tx.inventoryTransaction.create({
        data: {
          type: 'STOCK_OUT', quantity: -dto.quantity,
          reference: dto.reason, note: dto.note || dto.reason,
          productId: dto.productId, branchId, userId,
        },
      });

      return { previousStock: stock.quantity, newStock: stock.quantity - dto.quantity, change: -dto.quantity };
    });

    this.auditService.log({
      userId, action: 'STOCK_OUT', entity: 'Inventory', entityId: dto.productId,
      newValue: { quantity: -dto.quantity, reason: dto.reason, newStock: result.newStock },
    }).catch(e => this.logger.error('Audit log failed', e));
    return result;
  }

  // ==========================================================================
  // UC-13: Stock Adjustment — Kiểm kê
  // ==========================================================================
  async adjust(dto: StockAdjustmentDto, branchId: string, userId: string) {
    const result = await this.prisma.$transaction(async (tx) => {
      const stock = await tx.inventoryStock.findUnique({
        where: { productId_branchId: { productId: dto.productId, branchId } },
      });

      if (!stock) throw new NotFoundException('Product not found in this branch');

      const difference = dto.actualQty - stock.quantity;

      const adjustment = await tx.stockAdjustment.create({
        data: {
          systemQty: stock.quantity, actualQty: dto.actualQty,
          difference, reason: dto.reason, status: 'APPROVED',
          productId: dto.productId, branchId, userId,
          approvedById: userId, approvedAt: new Date(),
        },
      });

      const updatedStock = await tx.inventoryStock.update({
        where: { id: stock.id },
        data: { quantity: dto.actualQty },
      });

      await tx.inventoryTransaction.create({
        data: {
          type: 'ADJUSTMENT', quantity: difference, reference: adjustment.id,
          note: `Adjustment: ${dto.reason} (system: ${stock.quantity}, actual: ${dto.actualQty})`,
          productId: dto.productId, branchId, userId,
        },
      });

      return { previousStock: stock.quantity, newStock: updatedStock.quantity, difference, adjustmentId: adjustment.id };
    });

    this.auditService.log({
      userId, action: 'ADJUSTMENT', entity: 'Inventory', entityId: dto.productId,
      newValue: { systemQty: result.previousStock, actualQty: dto.actualQty, difference: result.difference, reason: dto.reason },
    }).catch(e => this.logger.error('Audit log failed', e));
    return result;
  }

  // ==========================================================================
  // UC-14: Inventory Transfer — Chuyển kho giữa branches
  // ==========================================================================
  async transfer(dto: TransferDto, userId: string) {
    if (dto.sourceBranchId === dto.destBranchId) {
      throw new BadRequestException('Source and destination branches must be different');
    }

    // Validate products exist
    const productIds = dto.items.map((i) => i.productId);
    const products = await this.prisma.product.findMany({
      where: { id: { in: productIds } },
      select: { id: true, name: true },
    });

    if (products.length !== productIds.length) {
      throw new NotFoundException('One or more products not found');
    }

    let refNumber = '';
    const transfer = await this.prisma.$transaction(async (tx) => {
      // 1. Create transfer record
      refNumber = `TF-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${Date.now().toString(36).toUpperCase()}${Math.random().toString(36).slice(2, 6).toUpperCase()}`;

      const created = await tx.inventoryTransfer.create({
        data: {
          referenceNumber: refNumber,
          status: 'COMPLETED', // Auto-complete for direct transfer
          sourceBranchId: dto.sourceBranchId,
          destBranchId: dto.destBranchId,
          requestedById: userId,
          approvedById: userId,
          notes: dto.notes,
          items: {
            create: dto.items.map((item) => ({
              productId: item.productId,
              quantity: item.quantity,
              receivedQty: item.quantity,
            })),
          },
        },
        include: { items: true },
      });

      // 2. Decrease source stock (atomic — prevents race condition)
      for (const item of dto.items) {
        const updated = await tx.inventoryStock.updateMany({
          where: {
            productId: item.productId,
            branchId: dto.sourceBranchId,
            quantity: { gte: item.quantity },
          },
          data: { quantity: { decrement: item.quantity } },
        });

        if (updated.count === 0) {
          const current = await tx.inventoryStock.findUnique({
            where: { productId_branchId: { productId: item.productId, branchId: dto.sourceBranchId } },
          });
          const product = products.find((p) => p.id === item.productId);
          throw new BadRequestException(
            `Insufficient stock for ${product?.name || item.productId}. Available: ${current?.quantity || 0}, Requested: ${item.quantity}`,
          );
        }

        // Source transaction
        await tx.inventoryTransaction.create({
          data: {
            type: 'TRANSFER_OUT',
            quantity: -item.quantity,
            reference: refNumber,
            note: `Transfer to branch ${dto.destBranchId}`,
            productId: item.productId,
            branchId: dto.sourceBranchId,
            userId,
          },
        });

        // 3. Increase destination stock
        const destStock = await tx.inventoryStock.findUnique({
          where: { productId_branchId: { productId: item.productId, branchId: dto.destBranchId } },
        });

        if (destStock) {
          await tx.inventoryStock.update({
            where: { id: destStock.id },
            data: { quantity: { increment: item.quantity } },
          });
        } else {
          // Auto-create stock record if it doesn't exist
          await tx.inventoryStock.create({
            data: {
              productId: item.productId,
              branchId: dto.destBranchId,
              quantity: item.quantity,
            },
          });
        }

        // Destination transaction
        await tx.inventoryTransaction.create({
          data: {
            type: 'TRANSFER_IN',
            quantity: item.quantity,
            reference: refNumber,
            note: `Transfer from branch ${dto.sourceBranchId}`,
            productId: item.productId,
            branchId: dto.destBranchId,
            userId,
          },
        });
      }

      return created;
    });

    this.auditService.log({
      userId, action: 'TRANSFER', entity: 'Inventory', entityId: transfer.id,
      newValue: { sourceBranch: dto.sourceBranchId, destBranch: dto.destBranchId, items: dto.items.length, refNumber },
    }).catch(e => this.logger.error('Audit log failed', e));
    this.logger.log(`Transfer ${refNumber}: ${dto.items.length} items from ${dto.sourceBranchId} to ${dto.destBranchId}`);
    return transfer;
  }

  // ==========================================================================
  // UC-15: Low Stock Alert
  // ==========================================================================
  async getLowStockAlerts(branchId?: string) {
    const where: any = {
      product: { isActive: true, minStock: { gt: 0 } },
    };

    // Fetch ALL stocks with a minStock threshold, then filter in-memory
    // Prisma doesn't support computed comparisons (quantity <= minStock) natively
    const stocks = await this.prisma.inventoryStock.findMany({
      where: branchId ? { ...where, branchId } : where,
      include: {
        product: { select: { id: true, sku: true, name: true, barcode: true, minStock: true, unit: true } },
        branch: { select: { id: true, name: true, code: true } },
      },
    });

    // Filter: only products where quantity <= minStock
    const lowStockItems = stocks.filter((s) => s.quantity <= s.product.minStock);

    // Sort by severity (most urgent first)
    lowStockItems.sort((a, b) => {
      const severityA = a.product.minStock > 0 ? a.quantity / a.product.minStock : 1;
      const severityB = b.product.minStock > 0 ? b.quantity / b.product.minStock : 1;
      return severityA - severityB;
    });

    return {
      total: lowStockItems.length,
      critical: lowStockItems.filter((s) => s.quantity === 0).length,
      warning: lowStockItems.filter((s) => s.quantity > 0 && s.quantity <= s.product.minStock).length,
      items: lowStockItems.map((s) => ({
        productId: s.product.id,
        sku: s.product.sku,
        productName: s.product.name,
        barcode: s.product.barcode,
        currentStock: s.quantity,
        minStock: s.product.minStock,
        deficit: Math.max(0, s.product.minStock - s.quantity),
        unit: s.product.unit,
        branch: s.branch.name,
      })),
    };
  }

  // ==========================================================================
  // Helper: Get inventory for a branch/product
  // ==========================================================================
  async getStock(branchId: string, productId?: string) {
    const where: any = { branchId };
    if (productId) where.productId = productId;

    return this.prisma.inventoryStock.findMany({
      where,
      include: {
        product: {
          select: {
            id: true, sku: true, name: true, barcode: true,
            costPrice: true, sellingPrice: true, minStock: true, unit: true,
          },
        },
      },
    });
  }

  // ==========================================================================
  // Get inventory transaction history
  // ==========================================================================
  async getTransactionHistory(
    branchId: string,
    productId?: string,
    page = 1,
    limit = 20,
  ) {
    const skip = (page - 1) * limit;
    const where: any = { branchId };
    if (productId) where.productId = productId;

    const [data, total] = await Promise.all([
      this.prisma.inventoryTransaction.findMany({
        where,
        skip,
        take: limit,
        include: {
          product: { select: { id: true, sku: true, name: true, unit: true } },
          user: { select: { id: true, fullName: true } },
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.inventoryTransaction.count({ where }),
    ]);

    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }
}
