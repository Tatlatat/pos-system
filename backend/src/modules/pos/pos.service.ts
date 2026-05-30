import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { SaleStatus } from '@prisma/client';
import {
  AddToCartDto, CheckoutDto, UpdateCartItemDto,
  ReturnDto, CancelInvoiceDto,
} from './dto/pos.dto';

// Shared include configuration for active cart operations
const CART_INCLUDES = {
  items: {
    include: {
      product: {
        select: {
          id: true,
          sku: true,
          name: true,
          barcode: true,
          sellingPrice: true,
          unit: true,
          imageUrl: true,
          taxRate: true,
        },
      },
    },
  },
  customer: {
    select: {
      id: true,
      name: true,
      phone: true,
    },
  },
};

@Injectable()
export class PosService {
  private readonly logger = new Logger(PosService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  // ==========================================================================
  // UC-16: Create/Manage Cart
  // ==========================================================================
  async getActiveCart(cashierId: string, branchId: string) {
    let cart = await this.prisma.cart.findFirst({
      where: { cashierId, branchId, isActive: true },
      include: CART_INCLUDES,
    });

    if (!cart) {
      cart = await this.prisma.cart.create({
        data: { cashierId, branchId },
        include: CART_INCLUDES,
      });
    }

    return this.calcCartTotal(cart);
  }

  // ==========================================================================
  // UC-16: Add item to cart (with retry for concurrent duplicate)
  // ==========================================================================
  async addToCart(dto: AddToCartDto, cashierId: string, branchId: string) {
    const { productId, quantity } = dto;

    await this.withRetry(() =>
      this.prisma.$transaction(async (tx) => {
        // 1. Verify active product to prevent pricing race conditions
        const product = await tx.product.findUnique({
          where: { id: productId },
        });
        if (!product || !product.isActive) {
          throw new NotFoundException('Product not found or inactive');
        }

        // 2. Fetch or create cart
        let cart = await tx.cart.findFirst({
          where: { cashierId, branchId, isActive: true },
        });
        if (!cart) {
          cart = await tx.cart.create({ data: { cashierId, branchId } });
        }

        // 3. Double-check stock inside transaction to prevent TOCTOU bugs
        const stock = await tx.inventoryStock.findUnique({
          where: { productId_branchId: { productId, branchId } },
        });
        if (!stock || stock.quantity < quantity) {
          throw new BadRequestException(
            `Insufficient stock. Available: ${stock?.quantity ?? 0}, Requested: ${quantity}`,
          );
        }

        // 4. Upsert item in cart
        const existingItem = await tx.cartItem.findUnique({
          where: { cartId_productId: { cartId: cart.id, productId } },
        });

        if (existingItem) {
          const newQuantity = existingItem.quantity + quantity;
          if (stock.quantity < newQuantity) {
            throw new BadRequestException(
              `Insufficient stock. Available: ${stock.quantity}, Requested: ${newQuantity}`,
            );
          }
          await tx.cartItem.update({
            where: { id: existingItem.id },
            data: {
              quantity: newQuantity,
              subtotal: (Number(existingItem.unitPrice) - Number(existingItem.discount)) * newQuantity,
            },
          });
        } else {
          await tx.cartItem.create({
            data: {
              cartId: cart.id,
              productId,
              quantity,
              unitPrice: product.sellingPrice,
              subtotal: Number(product.sellingPrice) * quantity,
            },
          });
        }
      })
    );

    return this.getActiveCart(cashierId, branchId);
  }

  // ==========================================================================
  // UC-17: Scan barcode
  // ==========================================================================
  async scanBarcode(barcode: string, cashierId: string, branchId: string) {
    const product = await this.prisma.product.findUnique({
      where: { barcode },
    });
    if (!product || !product.isActive) {
      throw new NotFoundException('Product not found for this barcode');
    }

    return this.addToCart({ productId: product.id, quantity: 1, barcode }, cashierId, branchId);
  }

  // ==========================================================================
  // Update cart item quantity
  // ==========================================================================
  async updateCartItem(itemId: string, dto: UpdateCartItemDto, cashierId: string) {
    const item = await this.prisma.cartItem.findUnique({
      where: { id: itemId },
      include: { cart: true },
    });
    if (!item || item.cart.cashierId !== cashierId) {
      throw new NotFoundException('Cart item not found');
    }

    if (dto.quantity <= 0) {
      await this.prisma.cartItem.delete({ where: { id: itemId } });
    } else {
      await this.prisma.cartItem.update({
        where: { id: itemId },
        data: {
          quantity: dto.quantity,
          subtotal: (Number(item.unitPrice) - Number(item.discount)) * dto.quantity,
        },
      });
    }

    return this.getActiveCart(cashierId, item.cart.branchId);
  }

  // ==========================================================================
  // Remove item from cart
  // ==========================================================================
  async removeCartItem(itemId: string, cashierId: string) {
    const item = await this.prisma.cartItem.findUnique({
      where: { id: itemId },
      include: { cart: true },
    });
    if (!item || item.cart.cashierId !== cashierId) {
      throw new NotFoundException('Cart item not found');
    }

    await this.prisma.cartItem.delete({ where: { id: itemId } });
    return this.getActiveCart(cashierId, item.cart.branchId);
  }

  // ==========================================================================
  // Set customer for cart
  // ==========================================================================
  async setCartCustomer(customerId: string, cashierId: string) {
    const cart = await this.prisma.cart.findFirst({
      where: { cashierId, isActive: true },
    });
    if (!cart) {
      throw new NotFoundException('No active cart');
    }

    await this.prisma.cart.update({
      where: { id: cart.id },
      data: { customerId },
    });

    return this.getActiveCart(cashierId, cart.branchId);
  }

  // ==========================================================================
  // UC-18: Checkout — Atomic cart lock prevents double-checkout race condition
  // ==========================================================================
  async checkout(dto: CheckoutDto, cashierId: string, branchId: string) {
    const sale = await this.withRetry(() =>
      this.prisma.$transaction(async (tx) => {
        // 1. Fetch cart and perform sanity checks
        const cart = await tx.cart.findFirst({
          where: { cashierId, branchId, isActive: true },
          include: {
            items: { include: { product: true } },
            customer: true,
          },
        });

        if (!cart || cart.items.length === 0) {
          throw new BadRequestException('Cart is empty');
        }

        // 2. Lock & deactivate cart to prevent double-checkout race conditions
        const updateResult = await tx.cart.updateMany({
          where: { cashierId, branchId, isActive: true, id: cart.id },
          data: { isActive: false },
        });
        if (updateResult.count === 0) {
          throw new BadRequestException('Cart has already been checked out');
        }

        // Generate invoice metadata
        const invoiceNo = `INV-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${Date.now().toString(36).toUpperCase()}${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
        const returnDeadline = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days return window

        let subtotal = 0;
        let totalTax = 0;
        const discountAmount = dto.discountAmount || 0;
        const saleItemsData: any[] = [];

        // 3. Process items and decrement inventory stock atomically
        for (const item of cart.items) {
          const product = await tx.product.findUnique({
            where: { id: item.productId },
            select: { sellingPrice: true, costPrice: true, taxRate: true },
          });
          if (!product) {
            throw new NotFoundException(`Product ${item.productId} not found`);
          }

          const { sellingPrice: unitPrice, costPrice, taxRate } = product;

          // Attempt stock decrement. The database check constraint triggers on failure.
          const updatedStock = await tx.inventoryStock.updateMany({
            where: {
              productId: item.productId,
              branchId,
              quantity: { gte: item.quantity },
            },
            data: { quantity: { decrement: item.quantity } },
          });

          if (updatedStock.count === 0) {
            const currentStock = await tx.inventoryStock.findUnique({
              where: { productId_branchId: { productId: item.productId, branchId } },
            });
            throw new BadRequestException(
              `Insufficient stock for ${item.product.name}. Available: ${currentStock?.quantity ?? 0}, Requested: ${item.quantity}`,
            );
          }

          // Log stock out transaction ledger (audit trail)
          await tx.inventoryTransaction.create({
            data: {
              type: 'SALE',
              quantity: -item.quantity,
              reference: invoiceNo,
              productId: item.productId,
              branchId,
              userId: cashierId,
            },
          });

          const lineSubtotal = (Number(unitPrice) - Number(item.discount)) * item.quantity;
          const lineTax = lineSubtotal * (Number(taxRate) / 100);
          subtotal += lineSubtotal;
          totalTax += lineTax;

          saleItemsData.push({
            productId: item.productId,
            quantity: item.quantity,
            unitPrice,
            costPrice,
            discount: item.discount,
            subtotal: lineSubtotal,
          });
        }

        const preDiscount = subtotal + totalTax;

        // 4. Validate discount limits (cashier fraud prevention)
        if (discountAmount > preDiscount * 0.5) {
          throw new BadRequestException(
            `Discount exceeds 50% limit. Discount: ${discountAmount}, Total: ${preDiscount}`,
          );
        }
        const grandTotal = preDiscount - discountAmount;

        // 5. Payment validation & handling
        const totalPaid = dto.payments.reduce((sum, p) => sum + p.amount, 0);
        if (totalPaid < grandTotal) {
          throw new BadRequestException(
            `Insufficient payment. Total: ${grandTotal}, Paid: ${totalPaid}`,
          );
        }

        const cashTotal = dto.payments
          .filter(p => p.method === 'CASH')
          .reduce((sum, p) => sum + p.amount, 0);
        const nonCashTotal = totalPaid - cashTotal;
        const remainingAfterCash = grandTotal - cashTotal;

        if (nonCashTotal > 0 && remainingAfterCash <= 0) {
          throw new BadRequestException(
            `Non-cash payment is not allowed when cash payment already covers or exceeds the grand total. Non-cash: ${nonCashTotal}, Remaining: ${remainingAfterCash}`,
          );
        }
        if (remainingAfterCash > 0 && nonCashTotal > remainingAfterCash) {
          throw new BadRequestException(
            `Non-cash payment exceeds remaining amount. Non-cash: ${nonCashTotal}, Remaining: ${remainingAfterCash}`,
          );
        }

        // Calculate and distribute change due (apply to first CASH payment only)
        let remainingChange = Math.max(0, totalPaid - grandTotal);
        const paymentsData = dto.payments.map((p) => {
          let paymentChange = 0;
          if (p.method === 'CASH' && remainingChange > 0) {
            paymentChange = remainingChange;
            remainingChange = 0;
          }
          return {
            method: p.method,
            amount: p.amount,
            reference: p.reference,
            changeDue: paymentChange,
          };
        });

        // 6. Create the final sale record
        return tx.sale.create({
          data: {
            invoiceNo,
            subtotal,
            taxAmount: totalTax,
            discountAmount,
            totalAmount: grandTotal,
            status: 'COMPLETED',
            returnDeadline,
            branchId,
            cashierId,
            customerId: dto.customerId || cart.customerId,
            notes: dto.notes,
            items: { create: saleItemsData },
            payments: { create: paymentsData },
          },
          include: {
            items: { include: { product: { select: { id: true, sku: true, name: true, unit: true } } } },
            payments: true,
            cashier: { select: { id: true, fullName: true } },
            branch: { select: { id: true, name: true, code: true } },
            customer: { select: { id: true, name: true, phone: true } },
          },
        });
      }, { isolationLevel: 'RepeatableRead' })
    );

    // Side Effects (async execution outside transaction boundaries)
    this.logger.log(`Sale completed: ${sale.invoiceNo} — ${Number(sale.totalAmount).toLocaleString()} VND`);
    this.updateLoyaltyPoints(sale).catch(e => this.logger.error('Loyalty update failed', e));
    this.auditService.log({
      userId: cashierId,
      action: 'CHECKOUT',
      entity: 'Sale',
      entityId: sale.id,
      newValue: {
        invoiceNo: sale.invoiceNo,
        total: Number(sale.totalAmount),
        items: sale.items.length,
        paymentMethods: dto.payments.map((p) => p.method),
      },
    }).catch(e => this.logger.error('Audit log failed', e));

    return sale;
  }

  /** Fire-and-forget loyalty points update */
  private async updateLoyaltyPoints(sale: any) {
    const customerId = sale.customerId;
    if (!customerId || Number(sale.totalAmount) <= 0) return;

    const rule = await this.prisma.loyaltyRule.findFirst({ where: { isActive: true } });
    if (!rule) return;

    const pointsEarned = Math.floor(Number(sale.totalAmount) / Number(rule.spendPerPoint));
    if (pointsEarned <= 0) return;

    await this.prisma.customer.update({
      where: { id: customerId },
      data: {
        totalPoints: { increment: pointsEarned },
        totalSpent: { increment: sale.totalAmount },
      },
    });

    await this.prisma.loyaltyTransaction.create({
      data: {
        points: pointsEarned,
        type: 'EARNED',
        reference: sale.invoiceNo,
        customerId,
        saleId: sale.id,
      },
    });
  }

  // ==========================================================================
  // UC-19: Get receipt data
  // ==========================================================================
  async getReceipt(saleId: string) {
    const sale = await this.prisma.sale.findUnique({
      where: { id: saleId },
      include: {
        items: {
          include: { product: { select: { id: true, sku: true, name: true, unit: true, barcode: true } } },
        },
        payments: true,
        cashier: { select: { id: true, fullName: true } },
        branch: { select: { id: true, name: true, code: true, address: true, phone: true } },
        customer: { select: { id: true, name: true, phone: true } },
      },
    });

    if (!sale) {
      throw new NotFoundException('Sale not found');
    }
    return sale;
  }

  // ==========================================================================
  // UC-20: Return Product (with double-refund guard)
  // ==========================================================================
  async returnProducts(dto: ReturnDto, userId: string) {
    const sale = await this.prisma.sale.findUnique({
      where: { id: dto.saleId },
      include: { items: { include: { product: true } } },
    });

    if (!sale) throw new NotFoundException('Sale not found');
    if (sale.status === 'CANCELLED') {
      throw new BadRequestException('Cannot return a cancelled invoice');
    }
    if (new Date() > sale.returnDeadline) {
      throw new BadRequestException('Return period has expired (7 days)');
    }

    const result = await this.prisma.$transaction(async (tx) => {
      // 1. Gather all previously returned quantities across all return transactions for this sale
      const existingReturns = await tx.returnItem.findMany({
        where: { saleItem: { saleId: dto.saleId } },
        select: { saleItemId: true, quantity: true },
      });

      const returnedQtyMap = new Map<string, number>();
      for (const returnItem of existingReturns) {
        const currentQty = returnedQtyMap.get(returnItem.saleItemId) ?? 0;
        returnedQtyMap.set(returnItem.saleItemId, currentQty + returnItem.quantity);
      }

      const returnNo = `RET-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${Date.now().toString(36).toUpperCase()}${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
      let totalRefund = 0;

      const returnRecord = await tx.return.create({
        data: {
          returnNo,
          reason: dto.reason,
          status: 'APPROVED',
          saleId: dto.saleId,
          customerId: sale.customerId,
          processedById: userId,
        },
      });

      // 2. Validate and return each item
      for (const itemDto of dto.items) {
        const saleItem = sale.items.find(si => si.id === itemDto.saleItemId);
        if (!saleItem) {
          throw new NotFoundException(`Sale item ${itemDto.saleItemId} not found`);
        }

        const alreadyReturned = returnedQtyMap.get(itemDto.saleItemId) ?? 0;
        const returnableQty = saleItem.quantity - alreadyReturned;
        if (itemDto.quantity > returnableQty) {
          throw new BadRequestException(
            `Cannot return more than remaining. Item: ${saleItem.product.name}, Sold: ${saleItem.quantity}, Already returned: ${alreadyReturned}, Requested: ${itemDto.quantity}`,
          );
        }

        const refundAmount = Number(saleItem.unitPrice) * itemDto.quantity;
        totalRefund += refundAmount;

        // Record returned item
        await tx.returnItem.create({
          data: {
            returnId: returnRecord.id,
            saleItemId: itemDto.saleItemId,
            productId: saleItem.productId,
            quantity: itemDto.quantity,
            refundAmount,
            condition: itemDto.condition || 'GOOD',
          },
        });

        // Restore inventory stock
        await tx.inventoryStock.updateMany({
          where: { productId: saleItem.productId, branchId: sale.branchId },
          data: { quantity: { increment: itemDto.quantity } },
        });

        // Audit inventory transaction ledger
        await tx.inventoryTransaction.create({
          data: {
            type: 'RETURN',
            quantity: itemDto.quantity,
            reference: returnNo,
            note: `Return from sale ${sale.invoiceNo}`,
            productId: saleItem.productId,
            branchId: sale.branchId,
            userId,
          },
        });
      }

      // 3. Re-evaluate sales status
      const totalReturnedQty = Array.from(returnedQtyMap.values()).reduce((sum, qty) => sum + qty, 0)
        + dto.items.reduce((sum, item) => sum + item.quantity, 0);
      const totalSoldQty = sale.items.reduce((sum, item) => sum + item.quantity, 0);
      const newStatus = totalReturnedQty >= totalSoldQty ? SaleStatus.RETURNED : SaleStatus.COMPLETED;

      await tx.sale.update({
        where: { id: dto.saleId },
        data: { status: newStatus },
      });

      return { returnNo, totalRefund, status: newStatus };
    });

    // Side Effects
    this.logger.log(`Return ${result.returnNo}: ${result.totalRefund.toLocaleString()} VND refunded`);
    this.deductReturnLoyalty(sale, result).catch(e => this.logger.error('Loyalty deduction failed', e));
    this.auditService.log({
      userId,
      action: 'RETURN',
      entity: 'Sale',
      entityId: dto.saleId,
      newValue: { returnNo: result.returnNo, refundAmount: result.totalRefund, status: result.status },
    }).catch(e => this.logger.error('Audit log failed', e));

    return result;
  }

  private async deductReturnLoyalty(sale: any, result: any) {
    const customerId = sale.customerId;
    if (!customerId || result.totalRefund <= 0 || Number(sale.totalAmount) <= 0) return;

    const rule = await this.prisma.loyaltyRule.findFirst({ where: { isActive: true } });
    if (!rule) return;

    const pointsReturned = Math.floor(result.totalRefund / Number(rule.spendPerPoint));
    if (pointsReturned <= 0) return;

    try {
      // 🛡️ Atomic DB-level points update prevents concurrency races
      await this.prisma.$executeRaw`
        UPDATE customers
        SET total_points = GREATEST(0, total_points - ${pointsReturned}::int)
        WHERE id = ${customerId}
          AND total_points > 0
      `;

      await this.prisma.loyaltyTransaction.create({
        data: {
          points: -pointsReturned,
          type: 'REDEEMED',
          reference: result.returnNo,
          customerId,
        },
      });
    } catch (e) {
      this.logger.error(`Failed to deduct return loyalty for customer ${customerId}`, e);
    }
  }

  private async deductCancelLoyalty(sale: any) {
    const customerId = sale.customerId;
    if (!customerId || Number(sale.totalAmount) <= 0) return;

    const rule = await this.prisma.loyaltyRule.findFirst({ where: { isActive: true } });
    if (!rule) return;

    try {
      // Calculate total refund amount
      const returns = await this.prisma.return.findMany({
        where: { saleId: sale.id, status: 'APPROVED' },
        include: { items: true },
      });

      const totalRefunded = returns.reduce((sum, r) => {
        return sum + r.items.reduce((itemSum, item) => itemSum + Number(item.refundAmount), 0);
      }, 0);

      const remainingAmount = Number(sale.totalAmount) - totalRefunded;
      if (remainingAmount <= 0) return;

      const pointsDeducted = Math.floor(remainingAmount / Number(rule.spendPerPoint));
      if (pointsDeducted <= 0) return;

      // 🛡️ Atomic DB-level points update prevents concurrency races
      await this.prisma.$executeRaw`
        UPDATE customers
        SET total_points = GREATEST(0, total_points - ${pointsDeducted}::int)
        WHERE id = ${customerId}
          AND total_points > 0
      `;

      await this.prisma.loyaltyTransaction.create({
        data: {
          points: -pointsDeducted,
          type: 'REDEEMED',
          reference: `CANCEL-${sale.invoiceNo}`,
          customerId,
        },
      });
    } catch (e) {
      this.logger.error(`Failed to deduct cancel loyalty for customer ${customerId}`, e);
    }
  }

  // ==========================================================================
  // Cancel Invoice
  // ==========================================================================
  async cancelInvoice(saleId: string, dto: CancelInvoiceDto, userId: string) {
    const updated = await this.prisma.$transaction(async (tx) => {
      const sale = await tx.sale.findUnique({
        where: { id: saleId },
        include: { items: true },
      });

      if (!sale) throw new NotFoundException('Sale not found');
      if (sale.status === 'CANCELLED') {
        throw new BadRequestException('Invoice already cancelled');
      }
      if (sale.status === 'RETURNED') {
        throw new BadRequestException('Cannot cancel an invoice that has been fully returned');
      }

      // 1. Gather already-returned items
      const existingReturns = await tx.returnItem.findMany({
        where: { saleItem: { saleId } },
        select: { saleItemId: true, quantity: true },
      });

      const returnedQtyMap = new Map<string, number>();
      for (const item of existingReturns) {
        const currentQty = returnedQtyMap.get(item.saleItemId) ?? 0;
        returnedQtyMap.set(item.saleItemId, currentQty + item.quantity);
      }

      // 2. Restore inventory stock (ignore items already returned)
      for (const item of sale.items) {
        const alreadyReturned = returnedQtyMap.get(item.id) ?? 0;
        const toRestore = item.quantity - alreadyReturned;
        if (toRestore <= 0) continue;

        await tx.inventoryStock.updateMany({
          where: { productId: item.productId, branchId: sale.branchId },
          data: { quantity: { increment: toRestore } },
        });

        await tx.inventoryTransaction.create({
          data: {
            type: 'RETURN',
            quantity: toRestore,
            reference: sale.invoiceNo,
            note: `Cancel invoice: ${dto.reason}`,
            productId: item.productId,
            branchId: sale.branchId,
            userId,
          },
        });
      }

      // 3. Mark sale as CANCELLED
      return tx.sale.update({
        where: { id: saleId },
        data: {
          status: 'CANCELLED',
          cancelledById: userId,
          cancelledAt: new Date(),
          cancelReason: dto.reason,
        },
      });
    });

    // Side Effects
    this.logger.log(`Invoice cancelled: ${updated.invoiceNo} — ${dto.reason}`);
    this.deductCancelLoyalty(updated).catch(e => this.logger.error('Loyalty deduction failed', e));
    this.auditService.log({
      userId,
      action: 'CANCEL_INVOICE',
      entity: 'Sale',
      entityId: saleId,
      newValue: { invoiceNo: updated.invoiceNo, reason: dto.reason },
    }).catch(e => this.logger.error('Audit log failed', e));

    return updated;
  }

  // ==========================================================================
  // List sales
  // ==========================================================================
  async listSales(branchId: string, page = 1, limit = 20) {
    const skip = (page - 1) * limit;

    const [data, total] = await Promise.all([
      this.prisma.sale.findMany({
        where: { branchId },
        skip,
        take: limit,
        include: {
          cashier: { select: { id: true, fullName: true } },
          customer: { select: { id: true, name: true, phone: true } },
          payments: true,
          _count: { select: { items: true } },
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.sale.count({ where: { branchId } }),
    ]);

    return {
      data,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  // ==========================================================================
  // Helper: Calculate cart totals
  // ==========================================================================
  private calcCartTotal(cart: any) {
    const items = cart.items.map((item: any) => ({
      ...item,
      lineTotal: Number(item.subtotal),
    }));

    let subtotal = 0;
    let totalTax = 0;
    let totalQuantity = 0;

    // Fast O(N) single-pass calculation for improved performance
    for (const item of items) {
      const lineSubtotal = Number(item.subtotal);
      const taxRate = Number(item.product?.taxRate ?? 8) / 100;

      subtotal += lineSubtotal;
      totalTax += lineSubtotal * taxRate;
      totalQuantity += item.quantity;
    }

    const roundedTax = Math.round(totalTax * 100) / 100;

    return {
      ...cart,
      items,
      summary: {
        itemCount: items.length,
        totalQuantity,
        subtotal,
        taxAmount: roundedTax,
        grandTotal: subtotal + roundedTax,
      },
    };
  }

  /** Retry a Prisma transaction on P2002 (unique constraint) */
  private async withRetry<T>(fn: () => Promise<T>, retries = 3): Promise<T> {
    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        return await fn();
      } catch (err: any) {
        if (err?.code === 'P2002' && attempt < retries) {
          this.logger.warn(`Database unique constraint conflict (P2002) - retrying attempt ${attempt}/${retries}`);
          continue;
        }
        throw err;
      }
    }
    throw new Error('Unreachable');
  }
}
