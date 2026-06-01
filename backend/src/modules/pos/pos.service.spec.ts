import { NotFoundException, BadRequestException } from '@nestjs/common';
import { PosService } from './pos.service';

// ---------------------------------------------------------------------------
// Mock factory — mimics the Prisma transaction client (tx) the service
// receives inside `this.prisma.$transaction(cb)`.
// ---------------------------------------------------------------------------
function createMockTx() {
  return {
    product: { findUnique: jest.fn(), findMany: jest.fn() },
    cart: { findFirst: jest.fn(), create: jest.fn(), updateMany: jest.fn(), update: jest.fn() },
    cartItem: { findUnique: jest.fn(), create: jest.fn(), update: jest.fn(), delete: jest.fn() },
    inventoryStock: { findUnique: jest.fn(), updateMany: jest.fn(), update: jest.fn(), create: jest.fn() },
    inventoryTransaction: { create: jest.fn() },
    sale: { create: jest.fn(), findUnique: jest.fn(), update: jest.fn() },
    return: { create: jest.fn() },
    returnItem: { findMany: jest.fn(), create: jest.fn() },
    customer: { findUnique: jest.fn() },
    stockAdjustment: { create: jest.fn() },
    inventoryTransfer: { create: jest.fn() },
  };
}

// ---------------------------------------------------------------------------
// Mock factory — mimics PrismaService (top-level calls outside transactions)
// ---------------------------------------------------------------------------
function createMockPrisma(tx: ReturnType<typeof createMockTx>) {
  return {
    $transaction: jest.fn((cb: any, _options?: any) => cb(tx)),
    product: { findUnique: jest.fn(), findMany: jest.fn() },
    cart: { findFirst: jest.fn(), create: jest.fn(), update: jest.fn() },
    cartItem: { findUnique: jest.fn(), update: jest.fn(), delete: jest.fn() },
    inventoryStock: { findUnique: jest.fn(), findMany: jest.fn() },
    inventoryTransaction: { findMany: jest.fn(), count: jest.fn() },
    sale: { findUnique: jest.fn(), findMany: jest.fn(), count: jest.fn() },
    customer: { findUnique: jest.fn(), update: jest.fn() },
    loyaltyRule: { findFirst: jest.fn() },
    loyaltyTransaction: { create: jest.fn() },
    return: { findMany: jest.fn() },
    returnItem: { findMany: jest.fn() },
    $executeRaw: jest.fn(),
  };
}

const CASHIER_ID = 'cashier-uuid-1';
const BRANCH_ID = 'branch-uuid-1';

describe('PosService', () => {
  let service: PosService;
  let tx: ReturnType<typeof createMockTx>;
  let prisma: ReturnType<typeof createMockPrisma>;
  let auditService: { log: jest.Mock };

  beforeEach(() => {
    tx = createMockTx();
    prisma = createMockPrisma(tx);
    auditService = { log: jest.fn().mockResolvedValue(undefined) };

    service = new PosService(prisma as any, auditService as any);
  });

  // ========================================================================
  // getActiveCart
  // ========================================================================
  describe('getActiveCart', () => {
    it('creates a new active cart when none exists', async () => {
      // No active cart yet
      prisma.cart.findFirst.mockResolvedValue(null);
      prisma.cart.create.mockResolvedValue({
        id: 'new-cart-id',
        cashierId: CASHIER_ID,
        branchId: BRANCH_ID,
        isActive: true,
        customerId: null,
        items: [],
        customer: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const result = await service.getActiveCart(CASHIER_ID, BRANCH_ID);

      expect(prisma.cart.findFirst).toHaveBeenCalledWith({
        where: { cashierId: CASHIER_ID, branchId: BRANCH_ID, isActive: true },
        include: expect.any(Object),
      });
      expect(prisma.cart.create).toHaveBeenCalledWith({
        data: { cashierId: CASHIER_ID, branchId: BRANCH_ID },
        include: expect.any(Object),
      });
      expect(result).toBeDefined();
      expect(result.summary).toBeDefined();
    });

    it('returns existing active cart without creating a new one', async () => {
      prisma.cart.findFirst.mockResolvedValue({
        id: 'existing-cart',
        cashierId: CASHIER_ID,
        branchId: BRANCH_ID,
        isActive: true,
        customerId: null,
        items: [],
        customer: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const result = await service.getActiveCart(CASHIER_ID, BRANCH_ID);

      expect(prisma.cart.create).not.toHaveBeenCalled();
      expect(result.id).toBe('existing-cart');
    });
  });

  // ========================================================================
  // addToCart
  // ========================================================================
  describe('addToCart', () => {
    const productId = 'product-uuid-1';
    const dto = { productId, quantity: 2 };

    beforeEach(() => {
      // getActiveCart (called at the end of addToCart) needs these to resolve
      prisma.cart.findFirst.mockResolvedValue({
        id: 'cart-id',
        cashierId: CASHIER_ID,
        branchId: BRANCH_ID,
        isActive: true,
        customerId: null,
        items: [],
        customer: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    });

    it('throws NotFoundException when product does not exist', async () => {
      tx.product.findUnique.mockResolvedValue(null);

      await expect(
        service.addToCart(dto, CASHIER_ID, BRANCH_ID),
      ).rejects.toThrow(NotFoundException);

      expect(tx.product.findUnique).toHaveBeenCalledWith({
        where: { id: productId },
      });
    });

    it('throws NotFoundException when product is inactive', async () => {
      tx.product.findUnique.mockResolvedValue({ id: productId, isActive: false });

      await expect(
        service.addToCart(dto, CASHIER_ID, BRANCH_ID),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws BadRequestException when stock is insufficient', async () => {
      tx.product.findUnique.mockResolvedValue({ id: productId, isActive: true, sellingPrice: 10000 });
      tx.cart.findFirst.mockResolvedValue({ id: 'cart-id', isActive: true });
      tx.inventoryStock.findUnique.mockResolvedValue({ quantity: 1 }); // only 1 in stock, requested 2

      await expect(
        service.addToCart(dto, CASHIER_ID, BRANCH_ID),
      ).rejects.toThrow(BadRequestException);
    });

    it('adds item to cart when everything is valid', async () => {
      const product = { id: productId, isActive: true, sellingPrice: 50000, unit: 'cái', taxRate: 8, name: 'Test Product', sku: 'TP001', barcode: '123456', imageUrl: null };
      tx.product.findUnique.mockResolvedValue(product);
      tx.cart.findFirst.mockResolvedValue({ id: 'cart-id', isActive: true });
      tx.inventoryStock.findUnique.mockResolvedValue({ quantity: 10 });
      tx.cartItem.findUnique.mockResolvedValue(null); // not already in cart
      tx.cartItem.create.mockResolvedValue({});

      const result = await service.addToCart(dto, CASHIER_ID, BRANCH_ID);

      expect(tx.cartItem.create).toHaveBeenCalledWith({
        data: {
          cartId: 'cart-id',
          productId,
          quantity: 2,
          unitPrice: 50000,
          subtotal: 100000,
        },
      });
      expect(result).toBeDefined();
    });
  });

  // ========================================================================
  // scanBarcode
  // ========================================================================
  describe('scanBarcode', () => {
    const barcode = '8934567890123';

    beforeEach(() => {
      // getActiveCart (called at the end of addToCart) needs these to resolve
      prisma.cart.findFirst.mockResolvedValue({
        id: 'cart-id', cashierId: CASHIER_ID, branchId: BRANCH_ID, isActive: true,
        customerId: null, items: [], customer: null,
        createdAt: new Date(), updatedAt: new Date(),
      });
    });

    it('looks up product by barcode and calls addToCart', async () => {
      prisma.product.findUnique.mockResolvedValue({
        id: 'product-uuid-1', isActive: true, name: 'Widget',
        sellingPrice: 50000, unit: 'cái', taxRate: 8, sku: 'WIDG', imageUrl: null,
      });

      // Transaction-level mocks for addToCart internals
      tx.product.findUnique.mockResolvedValue({
        id: 'product-uuid-1', isActive: true, sellingPrice: 50000,
        unit: 'cái', taxRate: 8, name: 'Widget', sku: 'WIDG', barcode, imageUrl: null,
      });
      tx.cart.findFirst.mockResolvedValue({ id: 'cart-id', isActive: true });
      tx.inventoryStock.findUnique.mockResolvedValue({ quantity: 10 });
      tx.cartItem.findUnique.mockResolvedValue(null);
      tx.cartItem.create.mockResolvedValue({});

      const result = await service.scanBarcode(barcode, CASHIER_ID, BRANCH_ID);

      expect(prisma.product.findUnique).toHaveBeenCalledWith({
        where: { barcode },
      });
      expect(result).toBeDefined();
    });

    it('throws NotFoundException when barcode does not match any product', async () => {
      prisma.product.findUnique.mockResolvedValue(null);

      await expect(
        service.scanBarcode(barcode, CASHIER_ID, BRANCH_ID),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws NotFoundException when product is inactive', async () => {
      prisma.product.findUnique.mockResolvedValue({
        id: 'product-uuid-1', isActive: false,
      });

      await expect(
        service.scanBarcode(barcode, CASHIER_ID, BRANCH_ID),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ========================================================================
  // updateCartItem
  // ========================================================================
  describe('updateCartItem', () => {
    const itemId = 'cart-item-uuid-1';
    const productId = 'product-uuid-1';

    beforeEach(() => {
      prisma.cartItem.findUnique.mockResolvedValue({
        id: itemId,
        cartId: 'cart-id',
        productId,
        quantity: 2,
        unitPrice: 20000,
        discount: 0,
        subtotal: 40000,
        cart: { id: 'cart-id', cashierId: CASHIER_ID, branchId: BRANCH_ID, isActive: true },
      });

      // getActiveCart (called at the end) needs these
      prisma.cart.findFirst.mockResolvedValue({
        id: 'cart-id', cashierId: CASHIER_ID, branchId: BRANCH_ID, isActive: true,
        customerId: null, items: [], customer: null,
        createdAt: new Date(), updatedAt: new Date(),
      });
    });

    it('updates quantity when > 0', async () => {
      prisma.cartItem.update.mockResolvedValue({});

      const result = await service.updateCartItem(
        itemId, { quantity: 5 }, CASHIER_ID,
      );

      expect(prisma.cartItem.update).toHaveBeenCalledWith({
        where: { id: itemId },
        data: {
          quantity: 5,
          subtotal: 20000 * 5, // unitPrice * quantity
        },
      });
      expect(result).toBeDefined();
    });

    it('deletes item and returns cart when quantity is 0', async () => {
      prisma.cartItem.delete.mockResolvedValue({});

      const result = await service.updateCartItem(
        itemId, { quantity: 0 }, CASHIER_ID,
      );

      expect(prisma.cartItem.delete).toHaveBeenCalledWith({
        where: { id: itemId },
      });
      expect(result).toBeDefined();
    });

    it('throws NotFoundException when item belongs to a different cashier', async () => {
      prisma.cartItem.findUnique.mockResolvedValue({
        id: itemId,
        cart: { id: 'cart-id', cashierId: 'other-cashier', branchId: BRANCH_ID, isActive: true },
      });

      await expect(
        service.updateCartItem(itemId, { quantity: 3 }, CASHIER_ID),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ========================================================================
  // removeCartItem
  // ========================================================================
  describe('removeCartItem', () => {
    const itemId = 'cart-item-uuid-1';

    beforeEach(() => {
      prisma.cartItem.findUnique.mockResolvedValue({
        id: itemId,
        cartId: 'cart-id',
        cart: { id: 'cart-id', cashierId: CASHIER_ID, branchId: BRANCH_ID, isActive: true },
      });

      // getActiveCart (called at the end) needs these
      prisma.cart.findFirst.mockResolvedValue({
        id: 'cart-id', cashierId: CASHIER_ID, branchId: BRANCH_ID, isActive: true,
        customerId: null, items: [], customer: null,
        createdAt: new Date(), updatedAt: new Date(),
      });
    });

    it('removes item and returns updated cart', async () => {
      prisma.cartItem.delete.mockResolvedValue({});

      const result = await service.removeCartItem(itemId, CASHIER_ID);

      expect(prisma.cartItem.delete).toHaveBeenCalledWith({
        where: { id: itemId },
      });
      expect(result).toBeDefined();
    });

    it('throws NotFoundException when item not found', async () => {
      prisma.cartItem.findUnique.mockResolvedValue(null);

      await expect(
        service.removeCartItem(itemId, CASHIER_ID),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ========================================================================
  // checkout
  // ========================================================================
  describe('checkout', () => {
    const productId = 'product-uuid-1';

    const baseCart = {
      id: 'cart-id',
      cashierId: CASHIER_ID,
      branchId: BRANCH_ID,
      isActive: true,
      customerId: null,
      customer: null,
      items: [
        {
          id: 'item-1',
          productId,
          quantity: 3,
          unitPrice: 20000,
          discount: 0,
          subtotal: 60000,
          product: { id: productId, name: 'Widget', sku: 'WIDG', sellingPrice: 20000, costPrice: 12000, taxRate: 8, isActive: true, unit: 'cái' },
        },
      ],
    };

    const checkoutDto = {
      payments: [{ method: 'CASH' as const, amount: 100000 }],
      notes: 'Test checkout',
    };

    beforeEach(() => {
      tx.cart.findFirst.mockResolvedValue(baseCart);
      tx.cart.updateMany.mockResolvedValue({ count: 1 });
      tx.product.findUnique.mockResolvedValue({ sellingPrice: 20000, costPrice: 12000, taxRate: 8 });
      tx.inventoryStock.updateMany.mockResolvedValue({ count: 1 });
      tx.inventoryTransaction.create.mockResolvedValue({});
      tx.sale.create.mockResolvedValue({
        id: 'sale-id',
        invoiceNo: 'INV-20240101-XXXX',
        totalAmount: 70000,
        items: [{ product: { id: productId, sku: 'WIDG', name: 'Widget', unit: 'cái' } }],
        payments: [{ method: 'CASH', amount: 100000, changeDue: 30000 }],
        cashier: { id: CASHIER_ID, fullName: 'Cashier' },
        branch: { id: BRANCH_ID, name: 'Main', code: 'BR-001' },
        customer: null,
      });
    });

    it('throws BadRequestException when cart is empty', async () => {
      tx.cart.findFirst.mockResolvedValue({ ...baseCart, items: [] });

      await expect(
        service.checkout(checkoutDto, CASHIER_ID, BRANCH_ID),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException when stock decrement guard returns count 0', async () => {
      // updateMany returns 0 — the atomic guard prevented the decrement
      tx.inventoryStock.updateMany.mockResolvedValue({ count: 0 });
      tx.inventoryStock.findUnique.mockResolvedValue({ quantity: 1 }); // available

      await expect(
        service.checkout(checkoutDto, CASHIER_ID, BRANCH_ID),
      ).rejects.toThrow(BadRequestException);
    });

    it('completes checkout successfully for a valid cart', async () => {
      const result = await service.checkout(checkoutDto, CASHIER_ID, BRANCH_ID);

      // Atomic guard: updateMany was called with a gte guard
      expect(tx.inventoryStock.updateMany).toHaveBeenCalledWith({
        where: { productId, branchId: BRANCH_ID, quantity: { gte: 3 } },
        data: { quantity: { decrement: 3 } },
      });

      // Ledger was written
      expect(tx.inventoryTransaction.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ type: 'SALE', quantity: -3, productId }) }),
      );

      expect(result).toBeDefined();
      expect(result.invoiceNo).toBeDefined();
      expect(auditService.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'CHECKOUT', entity: 'Sale' }),
      );
    });

    it('throws BadRequestException when total payment is less than grand total', async () => {
      const insufficientDto = {
        payments: [{ method: 'CASH' as const, amount: 40000 }],
        notes: 'Underpaid',
      };

      await expect(
        service.checkout(insufficientDto, CASHIER_ID, BRANCH_ID),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException when discount exceeds 50% of pre-discount total', async () => {
      // preDiscount = 60000 (subtotal) + 4800 (8% tax) = 64800
      // 50% of 64800 = 32400, so discount 40000 should be rejected
      const highDiscountDto = {
        discountAmount: 40000,
        payments: [{ method: 'CASH' as const, amount: 100000 }],
        notes: 'Too much discount',
      };

      await expect(
        service.checkout(highDiscountDto, CASHIER_ID, BRANCH_ID),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects non-cash payment when cash already covers the grand total', async () => {
      // cashTotal=70000 > grandTotal=64800 → remainingAfterCash = -5200 ≤ 0
      // If non-cash payment also exists, throw
      const cashExceedsDto = {
        payments: [
          { method: 'CASH' as const, amount: 70000 },
          { method: 'BANK_TRANSFER' as const, amount: 5000 },
        ],
        notes: 'Cash already covers',
      };

      await expect(
        service.checkout(cashExceedsDto, CASHIER_ID, BRANCH_ID),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects when non-cash payment exceeds the remaining amount after cash', async () => {
      // cash=30000, non-cash=40000, remainingAfterCash=64800-30000=34800
      // nonCashTotal=40000 > 34800 → throw
      const nonCashExceedsDto = {
        payments: [
          { method: 'CASH' as const, amount: 30000 },
          { method: 'BANK_TRANSFER' as const, amount: 40000 },
        ],
        notes: 'Non-cash too high',
      };

      await expect(
        service.checkout(nonCashExceedsDto, CASHIER_ID, BRANCH_ID),
      ).rejects.toThrow(BadRequestException);
    });

    it('computes correct change-due for cash-only payment exceeding grand total', async () => {
      // grandTotal = 64800, pay 100000 CASH → changeDue = 35200
      tx.sale.create.mockResolvedValue({
        id: 'sale-id', invoiceNo: 'INV-TEST-CHG', subtotal: 60000,
        taxAmount: 4800, discountAmount: 0, totalAmount: 64800,
        items: [{ product: { id: productId, sku: 'WIDG', name: 'Widget', unit: 'cái' } }],
        payments: [{ method: 'CASH', amount: 100000, changeDue: 35200 }],
        cashier: { id: CASHIER_ID, fullName: 'Cashier' },
        branch: { id: BRANCH_ID, name: 'Main', code: 'BR-001' },
        customer: null,
      });

      const result = await service.checkout(checkoutDto, CASHIER_ID, BRANCH_ID);

      // The sale was created with correct change in payments data
      expect(tx.sale.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            totalAmount: 64800,
            payments: expect.objectContaining({
              create: expect.arrayContaining([
                expect.objectContaining({ method: 'CASH', amount: 100000, changeDue: 35200 }),
              ]),
            }),
          }),
        }),
      );
      expect(result.payments[0].changeDue).toBe(35200);
    });

    it('accepts mixed cash + non-cash when cash is less than total and non-cash covers the rest', async () => {
      // cash=30000, remainingAfterCash=64800-30000=34800
      // nonCashTotal=34800 == remainingAfterCash → valid
      const mixedValidDto = {
        payments: [
          { method: 'CASH' as const, amount: 30000 },
          { method: 'BANK_TRANSFER' as const, amount: 34800 },
        ],
        notes: 'Mixed payment',
      };

      tx.sale.create.mockResolvedValue({
        id: 'sale-id', invoiceNo: 'INV-MIXED', subtotal: 60000,
        taxAmount: 4800, discountAmount: 0, totalAmount: 64800,
        items: [{ product: { id: productId, sku: 'WIDG', name: 'Widget', unit: 'cái' } }],
        payments: [
          { method: 'CASH', amount: 30000, changeDue: 0 },
          { method: 'BANK_TRANSFER', amount: 34800, changeDue: 0 },
        ],
        cashier: { id: CASHIER_ID, fullName: 'Cashier' },
        branch: { id: BRANCH_ID, name: 'Main', code: 'BR-001' },
        customer: { id: 'customer-uuid', name: 'Test', phone: '123' },
      });

      const result = await service.checkout(mixedValidDto, CASHIER_ID, BRANCH_ID);

      expect(result.invoiceNo).toBe('INV-MIXED');
      // No change due for either payment
      expect(result.payments[0].changeDue).toBe(0);
      expect(result.payments[1].changeDue).toBe(0);
    });

    it('fires loyalty points update for customer sales', async () => {
      // Set up a sale with a customer so updateLoyaltyPoints runs
      tx.sale.create.mockResolvedValue({
        id: 'sale-id', invoiceNo: 'INV-LOYAL', subtotal: 60000,
        taxAmount: 4800, discountAmount: 0, totalAmount: 64800,
        customerId: 'customer-uuid',
        items: [{ product: { id: productId, sku: 'WIDG', name: 'Widget', unit: 'cái' } }],
        payments: [{ method: 'CASH', amount: 100000, changeDue: 35200 }],
        cashier: { id: CASHIER_ID, fullName: 'Cashier' },
        branch: { id: BRANCH_ID, name: 'Main', code: 'BR-001' },
        customer: { id: 'customer-uuid', name: 'Test', phone: '123' },
      });

      // Loyalty rule: 1 point per 10000 spent
      prisma.loyaltyRule.findFirst.mockResolvedValue({
        id: 'rule-1', spendPerPoint: 10000, isActive: true,
      });
      prisma.customer.update.mockResolvedValue({});
      prisma.loyaltyTransaction.create.mockResolvedValue({});

      await service.checkout(checkoutDto, CASHIER_ID, BRANCH_ID);

      // Flush microtask queue so the fire-and-forget updateLoyaltyPoints runs
      await new Promise((resolve) => setTimeout(resolve, 10));

      // 64800 total / 10000 spendPerPoint = 6 points (floor)
      expect(prisma.loyaltyRule.findFirst).toHaveBeenCalled();
      expect(prisma.customer.update).toHaveBeenCalledWith({
        where: { id: 'customer-uuid' },
        data: {
          totalPoints: { increment: 6 },
          totalSpent: { increment: 64800 },
        },
      });
      expect(prisma.loyaltyTransaction.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            points: 6,
            type: 'EARNED',
            customerId: 'customer-uuid',
          }),
        }),
      );
    });
  });

  // ========================================================================
  // cancelInvoice
  // ========================================================================
  describe('cancelInvoice', () => {
    const saleId = 'sale-uuid-1';
    const productId = 'product-uuid-1';
    const saleItemId = 'sale-item-uuid-1';

    const user = { sub: 'user-uuid-1', email: 'admin@test.com', role: 'SUPER_ADMIN' as any, branchId: null, fullName: 'Admin' };

    const baseSale = {
      id: saleId,
      branchId: BRANCH_ID,
      status: 'COMPLETED',
      invoiceNo: 'INV-001',
      items: [
        { id: saleItemId, productId, quantity: 5, product: { name: 'Widget' } },
      ],
    };

    beforeEach(() => {
      tx.sale.findUnique.mockResolvedValue(baseSale);
      tx.returnItem.findMany.mockResolvedValue([]); // no prior returns
      tx.inventoryStock.updateMany.mockResolvedValue({ count: 1 });
      tx.inventoryTransaction.create.mockResolvedValue({});
      tx.sale.update.mockResolvedValue({
        ...baseSale, status: 'CANCELLED', cancelledById: user.sub, cancelReason: 'Test cancel',
      });
    });

    it('cancels a completed sale and restores inventory', async () => {
      const result = await service.cancelInvoice(
        saleId, { reason: 'Customer request' }, user,
      );

      // Restored all 5 units
      expect(tx.inventoryStock.updateMany).toHaveBeenCalledWith({
        where: { productId, branchId: BRANCH_ID },
        data: { quantity: { increment: 5 } },
      });

      // Ledger recorded
      expect(tx.inventoryTransaction.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            type: 'RETURN', quantity: 5, reference: 'INV-001',
            productId, branchId: BRANCH_ID, userId: user.sub,
          }),
        }),
      );

      // Sale marked cancelled
      expect(tx.sale.update).toHaveBeenCalledWith({
        where: { id: saleId },
        data: expect.objectContaining({
          status: 'CANCELLED',
          cancelledById: user.sub,
          cancelReason: 'Customer request',
        }),
      });

      expect(result.status).toBe('CANCELLED');
      expect(auditService.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'CANCEL_INVOICE', entity: 'Sale' }),
      );
    });

    it('skips already-returned items when restoring inventory', async () => {
      // 2 out of 5 units were already returned → only restore 3
      tx.returnItem.findMany.mockResolvedValue([
        { saleItemId, quantity: 2 },
      ]);

      await service.cancelInvoice(saleId, { reason: 'Cancel after partial return' }, user);

      expect(tx.inventoryStock.updateMany).toHaveBeenCalledWith({
        where: { productId, branchId: BRANCH_ID },
        data: { quantity: { increment: 3 } }, // 5 - 2 = 3
      });

      expect(tx.inventoryTransaction.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ quantity: 3 }),
        }),
      );
    });

    it('throws BadRequestException when invoice is already cancelled', async () => {
      tx.sale.findUnique.mockResolvedValue({ ...baseSale, status: 'CANCELLED' });

      await expect(
        service.cancelInvoice(saleId, { reason: 'Double cancel' }, user),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException when invoice has been fully returned', async () => {
      tx.sale.findUnique.mockResolvedValue({ ...baseSale, status: 'RETURNED' });

      await expect(
        service.cancelInvoice(saleId, { reason: 'Cancel returned' }, user),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // ========================================================================
  // returnProducts
  // ========================================================================
  describe('returnProducts', () => {
    const saleId = 'sale-uuid-1';
    const saleItemId = 'sale-item-uuid-1';
    const productId = 'product-uuid-1';

    const baseSale = {
      id: saleId,
      branchId: BRANCH_ID,
      status: 'COMPLETED' as const,
      returnDeadline: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000), // 3 days from now
      customerId: 'customer-uuid',
      invoiceNo: 'INV-001',
      totalAmount: 60000,
      items: [
        {
          id: saleItemId,
          productId,
          product: { id: productId, name: 'Widget', sku: 'WIDG' },
          quantity: 5,
          unitPrice: 12000,
          discount: 0,
          subtotal: 60000,
          costPrice: 8000,
        },
      ],
    };

    const user = { sub: 'user-uuid-1', email: 'admin@test.com', role: 'SUPER_ADMIN' as any, branchId: null, fullName: 'Admin' };
    const returnDto = {
      saleId,
      reason: 'Defective item',
      items: [{ saleItemId, quantity: 2, condition: 'DAMAGED' }],
    };

    beforeEach(() => {
      prisma.sale.findUnique.mockResolvedValue(baseSale);
    });

    it('throws BadRequestException when trying to return a cancelled sale', async () => {
      prisma.sale.findUnique.mockResolvedValue({ ...baseSale, status: 'CANCELLED' });

      await expect(
        service.returnProducts(returnDto, user),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException when refunding more than was sold', async () => {
      // Simulate 4 already returned + 2 requested = 6 > 5 sold
      tx.returnItem.findMany.mockResolvedValue([
        { saleItemId, quantity: 4 },
      ]);
      tx.inventoryStock.updateMany.mockResolvedValue({ count: 1 });

      const overLimitDto = {
        saleId,
        reason: 'Too many',
        items: [{ saleItemId, quantity: 2, condition: 'GOOD' }],
      };

      await expect(
        service.returnProducts(overLimitDto, user),
      ).rejects.toThrow(BadRequestException);
    });

    it('processes a valid return and restores inventory', async () => {
      tx.returnItem.findMany.mockResolvedValue([]); // no prior returns
      tx.return.create.mockResolvedValue({ id: 'return-id', returnNo: 'RET-001' });
      tx.returnItem.create.mockResolvedValue({});
      tx.inventoryStock.updateMany.mockResolvedValue({ count: 1 });
      tx.inventoryTransaction.create.mockResolvedValue({});
      tx.sale.update.mockResolvedValue({});

      const result = await service.returnProducts(returnDto, user);

      expect(result.returnNo).toBeDefined();
      expect(result.totalRefund).toBe(24000); // 2 × 12000
      expect(result.status).toBe('COMPLETED'); // 2 returned out of 5 total

      // Inventory was restored
      expect(tx.inventoryStock.updateMany).toHaveBeenCalledWith({
        where: { productId, branchId: BRANCH_ID },
        data: { quantity: { increment: 2 } },
      });

      // Ledger recorded
      expect(tx.inventoryTransaction.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ type: 'RETURN', quantity: 2 }) }),
      );
    });
  });
});
