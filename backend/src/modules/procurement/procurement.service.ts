import {
  Injectable, NotFoundException, BadRequestException, Logger,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { CreatePurchaseOrderDto, GoodsReceiptDto } from './dto/procurement.dto';

@Injectable()
export class ProcurementService {
  private readonly logger = new Logger(ProcurementService.name);

  constructor(
    private prisma: PrismaService,
    private auditService: AuditService,
  ) {}

  // ==========================================================================
  // UC-22: Create Purchase Order
  // ==========================================================================
  async createPO(dto: CreatePurchaseOrderDto, userId: string) {
    // Verify supplier
    const supplier = await this.prisma.supplier.findUnique({ where: { id: dto.supplierId } });
    if (!supplier) throw new NotFoundException('Supplier not found');

    // Verify all products
    const productIds = dto.items.map((i) => i.productId);
    const products = await this.prisma.product.findMany({
      where: { id: { in: productIds } },
    });
    if (products.length !== productIds.length) {
      throw new NotFoundException('One or more products not found');
    }

    const poNumber = `PO-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${Date.now().toString(36).toUpperCase()}${Math.random().toString(36).slice(2, 6).toUpperCase()}`;

    const po = await this.prisma.$transaction(async (tx) => {
      const created = await tx.purchaseOrder.create({
        data: {
          poNumber,
          status: 'PENDING_APPROVAL',
          supplierId: dto.supplierId,
          createdById: userId,
          notes: dto.notes,
          items: {
            create: dto.items.map((item) => ({
              productId: item.productId,
              quantity: item.quantity,
              unitCost: item.unitCost,
              lineTotal: item.quantity * item.unitCost,
            })),
          },
        },
        include: {
          supplier: { select: { id: true, name: true, code: true } },
          items: {
            include: { product: { select: { id: true, sku: true, name: true, unit: true } } },
          },
          createdBy: { select: { id: true, fullName: true } },
        },
      });

      // Calculate and set totalCost inside the same transaction
      const totalCost = created.items.reduce((sum, item) => sum + Number(item.lineTotal), 0);
      return tx.purchaseOrder.update({
        where: { id: created.id },
        data: { totalCost },
        include: {
          supplier: { select: { id: true, name: true, code: true } },
          items: {
            include: { product: { select: { id: true, sku: true, name: true, unit: true } } },
          },
          createdBy: { select: { id: true, fullName: true } },
        },
      });
    });

    await this.auditService.log({
      userId,
      action: 'CREATE_PO',
      entity: 'PurchaseOrder',
      entityId: po.id,
      newValue: { poNumber, totalCost: Number(po.totalCost), itemCount: dto.items.length },
    });

    this.logger.log(`PO created: ${poNumber} — ${Number(po.totalCost).toLocaleString()} VND`);
    return po;
  }

  // ==========================================================================
  // UC-23: Approve/Reject Purchase Order
  // ==========================================================================
  async approvePO(poId: string, userId: string) {
    const po = await this.prisma.purchaseOrder.findUnique({ where: { id: poId } });
    if (!po) throw new NotFoundException('Purchase Order not found');
    if (po.status !== 'PENDING_APPROVAL') {
      throw new BadRequestException(`PO cannot be approved. Current status: ${po.status}`);
    }

    const updated = await this.prisma.purchaseOrder.update({
      where: { id: poId },
      data: { status: 'APPROVED', approvedById: userId, approvedAt: new Date() },
    });

    await this.auditService.log({
      userId,
      action: 'APPROVE_PO',
      entity: 'PurchaseOrder',
      entityId: poId,
    });

    return updated;
  }

  async rejectPO(poId: string, userId: string) {
    const po = await this.prisma.purchaseOrder.findUnique({ where: { id: poId } });
    if (!po) throw new NotFoundException('Purchase Order not found');
    if (po.status !== 'PENDING_APPROVAL') throw new BadRequestException(`Cannot reject PO with status: ${po.status}`);
    if (!po) throw new NotFoundException('Purchase Order not found');

    const updated = await this.prisma.purchaseOrder.update({
      where: { id: poId },
      data: { status: 'REJECTED' },
    });

    await this.auditService.log({
      userId,
      action: 'REJECT_PO',
      entity: 'PurchaseOrder',
      entityId: poId,
    });

    return updated;
  }

  // ==========================================================================
  // UC-24: Receive Goods
  // ==========================================================================
  async receiveGoods(dto: GoodsReceiptDto, branchId: string, userId: string) {
    const po = await this.prisma.purchaseOrder.findUnique({
      where: { id: dto.poId },
      include: { items: true },
    });

    if (!po) throw new NotFoundException('Purchase Order not found');
    if (po.status !== 'APPROVED') {
      throw new BadRequestException('PO must be approved before receiving goods');
    }
    // 🛡️ Supplier must match PO's supplier
    if (dto.supplierId !== po.supplierId) {
      throw new BadRequestException('Supplier does not match PO supplier');
    }

    const receipt = await this.prisma.$transaction(async (tx) => {
      const receiptNo = `GR-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${Date.now().toString(36).toUpperCase()}${Math.random().toString(36).slice(2, 6).toUpperCase()}`;

      const created = await tx.goodsReceipt.create({
        data: {
          receiptNumber: receiptNo,
          status: 'COMPLETED',
          poId: dto.poId,
          supplierId: dto.supplierId,
          branchId,
          receivedById: userId,
          notes: dto.notes,
          items: {
            create: dto.items.map((item) => ({
              productId: item.productId,
              poItemId: item.poItemId,
              quantity: item.quantity,
              unitCost: item.unitCost,
              lineTotal: item.quantity * item.unitCost,
            })),
          },
        },
        include: {
          items: {
            include: { product: { select: { id: true, sku: true, name: true } } },
          },
        },
      });

      // Update PO item received quantities (atomic guard — prevents concurrent overshoot)
      for (const item of dto.items) {
        // 🛡️ Atomic: DB only increments if received_qty + ? <= quantity
        const result = await tx.$executeRaw`
          UPDATE purchase_order_items
          SET received_qty = received_qty + ${item.quantity}
          WHERE id = ${item.poItemId}
            AND (received_qty + ${item.quantity}) <= quantity
        `;

        if (result === 0) {
          const poItem = await tx.purchaseOrderItem.findUnique({
            where: { id: item.poItemId },
          });
          throw new BadRequestException(
            `PO item overshoot. Ordered: ${poItem?.quantity || '?'}, Already received: ${poItem?.receivedQty || '?'}, Requested: ${item.quantity}`,
          );
        }

        // Increase stock
        const stock = await tx.inventoryStock.findUnique({
          where: { productId_branchId: { productId: item.productId, branchId } },
        });

        if (stock) {
          await tx.inventoryStock.update({
            where: { id: stock.id },
            data: { quantity: { increment: item.quantity } },
          });
        } else {
          await tx.inventoryStock.create({
            data: { productId: item.productId, branchId, quantity: item.quantity },
          });
        }

        // Record inventory transaction
        await tx.inventoryTransaction.create({
          data: {
            type: 'STOCK_IN',
            quantity: item.quantity,
            reference: receiptNo,
            note: `Goods receipt from PO ${po.poNumber}`,
            productId: item.productId,
            branchId,
            userId,
          },
        });
      }

      // Check if PO is fully received
      const updatedItems = await tx.purchaseOrderItem.findMany({
        where: { poId: dto.poId },
      });
      const allReceived = updatedItems.every((i) => i.receivedQty >= i.quantity);

      await tx.purchaseOrder.update({
        where: { id: dto.poId },
        data: { status: allReceived ? 'RECEIVED' : 'PARTIAL' },
      });

      return { id: created.id, receiptNumber: created.receiptNumber };
    });

    await this.auditService.log({
      userId, action: 'GOODS_RECEIPT', entity: 'PurchaseOrder', entityId: dto.poId,
      newValue: { receiptNo: receipt.receiptNumber, itemCount: dto.items.length },
    });
    this.logger.log(`Goods Receipt ${receipt.receiptNumber}: ${dto.items.length} items from PO ${po.poNumber}`);
    return receipt;
  }

  // ==========================================================================
  // List POs
  // ==========================================================================
  async listPOs(page = 1, limit = 20, status?: string) {
    const skip = (page - 1) * limit;
    const where: any = {};
    if (status) where.status = status;

    const [data, total] = await Promise.all([
      this.prisma.purchaseOrder.findMany({
        where,
        skip,
        take: limit,
        include: {
          supplier: { select: { id: true, name: true, code: true } },
          createdBy: { select: { id: true, fullName: true } },
          approvedBy: { select: { id: true, fullName: true } },
          items: {
            include: { product: { select: { id: true, sku: true, name: true, unit: true } } },
          },
          _count: { select: { receipts: true } },
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.purchaseOrder.count({ where }),
    ]);

    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async findPO(id: string) {
    const po = await this.prisma.purchaseOrder.findUnique({
      where: { id },
      include: {
        supplier: true,
        createdBy: { select: { id: true, fullName: true } },
        approvedBy: { select: { id: true, fullName: true } },
        items: {
          include: { product: true },
        },
        receipts: {
          include: {
            items: { include: { product: true } },
            receivedBy: { select: { id: true, fullName: true } },
          },
        },
      },
    });
    if (!po) throw new NotFoundException('PO not found');
    return po;
  }

  async listGoodsReceipts(page = 1, limit = 20) {
    const skip = (page - 1) * limit;
    const [data, total] = await Promise.all([
      this.prisma.goodsReceipt.findMany({
        skip,
        take: limit,
        include: {
          po: { select: { id: true, poNumber: true } },
          supplier: { select: { id: true, name: true } },
          branch: { select: { id: true, name: true } },
          receivedBy: { select: { id: true, fullName: true } },
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.goodsReceipt.count(),
    ]);

    return { data, total, page: +page, limit: +limit, totalPages: Math.ceil(total / limit) };
  }
}
