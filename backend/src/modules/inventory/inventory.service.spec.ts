import { NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { InventoryService } from './inventory.service';

// ---------------------------------------------------------------------------
// Mock factory — mimics the Prisma transaction client (tx) the service
// receives inside `this.prisma.$transaction(cb)`.
// ---------------------------------------------------------------------------
function createMockTx() {
  return {
    product: { findUnique: jest.fn(), findMany: jest.fn() },
    inventoryStock: { findUnique: jest.fn(), updateMany: jest.fn(), update: jest.fn(), create: jest.fn() },
    inventoryTransaction: { create: jest.fn() },
    stockAdjustment: { create: jest.fn() },
    inventoryTransfer: { create: jest.fn() },
  };
}

// ---------------------------------------------------------------------------
// Mock factory — mimics PrismaService (top-level calls outside transactions)
// ---------------------------------------------------------------------------
function createMockPrisma(tx: ReturnType<typeof createMockTx>) {
  return {
    $transaction: jest.fn((cb: any) => cb(tx)),
    product: { findUnique: jest.fn(), findMany: jest.fn() },
    inventoryStock: { findUnique: jest.fn(), findMany: jest.fn() },
    inventoryTransaction: { findMany: jest.fn(), count: jest.fn() },
    return: { findMany: jest.fn() },
    returnItem: { findMany: jest.fn() },
    $executeRaw: jest.fn(),
  };
}

const BRANCH_ID = 'branch-uuid-1';
const USER_ID = 'user-uuid-1';

describe('InventoryService', () => {
  let service: InventoryService;
  let tx: ReturnType<typeof createMockTx>;
  let prisma: ReturnType<typeof createMockPrisma>;
  let auditService: { log: jest.Mock };

  beforeEach(() => {
    tx = createMockTx();
    prisma = createMockPrisma(tx);
    auditService = { log: jest.fn().mockResolvedValue(undefined) };

    service = new InventoryService(prisma as any, auditService as any);
  });

  // ========================================================================
  // stockIn
  // ========================================================================
  describe('stockIn', () => {
    const productId = 'product-uuid-1';
    const dto = { productId, quantity: 10, reference: 'PO-001', note: 'Restock' };

    it('throws NotFoundException when product not in branch inventory', async () => {
      tx.inventoryStock.findUnique.mockResolvedValue(null);

      await expect(
        service.stockIn(dto, BRANCH_ID, USER_ID),
      ).rejects.toThrow(NotFoundException);
    });

    it('increases stock and records a transaction', async () => {
      tx.inventoryStock.findUnique.mockResolvedValue({ id: 'stock-id', quantity: 20 });
      tx.inventoryStock.update.mockResolvedValue({ id: 'stock-id', quantity: 30 });
      tx.inventoryTransaction.create.mockResolvedValue({});

      const result = await service.stockIn(dto, BRANCH_ID, USER_ID);

      expect(tx.inventoryStock.update).toHaveBeenCalledWith({
        where: { id: 'stock-id' },
        data: { quantity: { increment: 10 } },
      });

      expect(tx.inventoryTransaction.create).toHaveBeenCalledWith({
        data: {
          type: 'STOCK_IN',
          quantity: 10,
          reference: 'PO-001',
          note: 'Restock',
          productId,
          branchId: BRANCH_ID,
          userId: USER_ID,
        },
      });

      expect(result).toEqual({
        previousStock: 20,
        newStock: 30,
        change: 10,
      });

      expect(auditService.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'STOCK_IN', entity: 'Inventory', entityId: productId }),
      );
    });
  });

  // ========================================================================
  // stockOut
  // ========================================================================
  describe('stockOut', () => {
    const productId = 'product-uuid-1';
    const dto = { productId, quantity: 5, reason: 'DAMAGE', note: 'Broken during shipment' };

    it('throws NotFoundException when product not found in branch', async () => {
      tx.inventoryStock.findUnique.mockResolvedValue(null);

      await expect(
        service.stockOut(dto, BRANCH_ID, USER_ID),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws BadRequestException when stock is insufficient', async () => {
      // Only 3 in stock, trying to remove 5
      tx.inventoryStock.findUnique.mockResolvedValue({ id: 'stock-id', quantity: 3 });

      // Atomic guard: updateMany returns count 0 because quantity gte 5 fails
      tx.inventoryStock.updateMany.mockResolvedValue({ count: 0 });

      await expect(
        service.stockOut(dto, BRANCH_ID, USER_ID),
      ).rejects.toThrow(BadRequestException);

      expect(tx.inventoryStock.updateMany).toHaveBeenCalledWith({
        where: { id: 'stock-id', quantity: { gte: 5 } },
        data: { quantity: { decrement: 5 } },
      });
    });

    it('deducts stock successfully when sufficient stock exists', async () => {
      tx.inventoryStock.findUnique.mockResolvedValue({ id: 'stock-id', quantity: 20 });
      tx.inventoryStock.updateMany.mockResolvedValue({ count: 1 });
      tx.inventoryTransaction.create.mockResolvedValue({});

      const result = await service.stockOut(dto, BRANCH_ID, USER_ID);

      expect(result).toEqual({
        previousStock: 20,
        newStock: 15,
        change: -5,
      });

      expect(tx.inventoryTransaction.create).toHaveBeenCalledWith({
        data: {
          type: 'STOCK_OUT',
          quantity: -5,
          reference: 'DAMAGE',
          note: 'Broken during shipment',
          productId,
          branchId: BRANCH_ID,
          userId: USER_ID,
        },
      });

      expect(auditService.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'STOCK_OUT', entity: 'Inventory' }),
      );
    });
  });

  // ========================================================================
  // adjust (Stock Adjustment)
  // ========================================================================
  describe('adjust', () => {
    const productId = 'product-uuid-1';
    const dto = { productId, actualQty: 25, reason: 'Inventory count correction' };

    it('throws NotFoundException when product not in branch inventory', async () => {
      tx.inventoryStock.findUnique.mockResolvedValue(null);

      await expect(
        service.adjust(dto, BRANCH_ID, USER_ID),
      ).rejects.toThrow(NotFoundException);
    });

    it('adjusts stock to the actual quantity and records the difference', async () => {
      // System says 20, actual is 25 → difference = +5
      tx.inventoryStock.findUnique.mockResolvedValue({ id: 'stock-id', quantity: 20 });
      tx.stockAdjustment.create.mockResolvedValue({ id: 'adj-id' });
      tx.inventoryStock.update.mockResolvedValue({ id: 'stock-id', quantity: 25 });
      tx.inventoryTransaction.create.mockResolvedValue({});

      const result = await service.adjust(dto, BRANCH_ID, USER_ID);

      expect(result).toEqual({
        previousStock: 20,
        newStock: 25,
        difference: 5,
        adjustmentId: 'adj-id',
      });

      // Stock was set to actualQty directly (overwrite, not increment)
      expect(tx.inventoryStock.update).toHaveBeenCalledWith({
        where: { id: 'stock-id' },
        data: { quantity: 25 },
      });

      // Ledger records the difference
      expect(tx.inventoryTransaction.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            type: 'ADJUSTMENT',
            quantity: 5,
          }),
        }),
      );

      expect(auditService.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'ADJUSTMENT', entity: 'Inventory' }),
      );
    });

    it('correctly records a negative difference', async () => {
      // System says 30, actual is 20 → difference = -10
      tx.inventoryStock.findUnique.mockResolvedValue({ id: 'stock-id', quantity: 30 });
      tx.stockAdjustment.create.mockResolvedValue({ id: 'adj-id' });
      tx.inventoryStock.update.mockResolvedValue({ id: 'stock-id', quantity: 20 });
      tx.inventoryTransaction.create.mockResolvedValue({});

      const result = await service.adjust(
        { productId, actualQty: 20, reason: 'Overcount correction' },
        BRANCH_ID,
        USER_ID,
      );

      expect(result).toEqual({
        previousStock: 30,
        newStock: 20,
        difference: -10,
        adjustmentId: 'adj-id',
      });

      expect(tx.inventoryTransaction.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            type: 'ADJUSTMENT',
            quantity: -10,
          }),
        }),
      );
    });
  });

  // ========================================================================
  // transfer
  // ========================================================================
  describe('transfer', () => {
    const productId = 'product-uuid-1';
    const otherBranchId = 'branch-uuid-2';

    const dto = {
      sourceBranchId: BRANCH_ID,
      destBranchId: otherBranchId,
      items: [{ productId, quantity: 5 }],
      notes: 'Stock rebalancing',
    };

    const superAdminUser = { sub: USER_ID, email: 'admin@test.com', role: 'SUPER_ADMIN' as any, branchId: null, fullName: 'Admin' };

    beforeEach(() => {
      // Products exist
      prisma.product.findMany.mockResolvedValue([
        { id: productId, name: 'Widget' },
      ]);

      // Transaction-level mocks for success path
      tx.inventoryTransfer.create.mockResolvedValue({
        id: 'transfer-id',
        referenceNumber: 'TF-20260601-TEST',
        status: 'COMPLETED',
        items: [{ productId, quantity: 5 }],
      });

      // Source stock decrement succeeds
      tx.inventoryStock.updateMany.mockResolvedValue({ count: 1 });

      // Destination stock exists
      tx.inventoryStock.findUnique.mockResolvedValue({ id: 'dest-stock-id', quantity: 10 });
      tx.inventoryStock.update.mockResolvedValue({ id: 'dest-stock-id', quantity: 15 });

      tx.inventoryTransaction.create.mockResolvedValue({});
    });

    it('throws BadRequestException when source and destination are the same', async () => {
      const sameBranchDto = { ...dto, destBranchId: BRANCH_ID };

      await expect(
        service.transfer(sameBranchDto, superAdminUser),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws ForbiddenException when user is not SUPER_ADMIN and not from source branch', async () => {
      const cashierUser = { sub: USER_ID, email: 'cashier@test.com', role: 'CASHIER' as any, branchId: 'other-branch', fullName: 'Cashier' };

      await expect(
        service.transfer(dto, cashierUser),
      ).rejects.toThrow(ForbiddenException);
    });

    it('throws NotFoundException when one or more products do not exist', async () => {
      prisma.product.findMany.mockResolvedValue([]); // product not found

      await expect(
        service.transfer(dto, superAdminUser),
      ).rejects.toThrow(NotFoundException);
    });

    it('successfully transfers stock from source to destination branch', async () => {
      const result = await service.transfer(dto, superAdminUser);

      // Source: atomic decrement with gte guard
      expect(tx.inventoryStock.updateMany).toHaveBeenCalledWith({
        where: { productId, branchId: BRANCH_ID, quantity: { gte: 5 } },
        data: { quantity: { decrement: 5 } },
      });

      // Source: TRANSFER_OUT transaction recorded
      expect(tx.inventoryTransaction.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            type: 'TRANSFER_OUT',
            quantity: -5,
            productId,
            branchId: BRANCH_ID,
            userId: USER_ID,
          }),
        }),
      );

      // Destination: stock was incremented on existing record
      expect(tx.inventoryStock.findUnique).toHaveBeenCalledWith({
        where: { productId_branchId: { productId, branchId: otherBranchId } },
      });
      expect(tx.inventoryStock.update).toHaveBeenCalledWith({
        where: { id: 'dest-stock-id' },
        data: { quantity: { increment: 5 } },
      });

      // Destination: TRANSFER_IN transaction recorded
      expect(tx.inventoryTransaction.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            type: 'TRANSFER_IN',
            quantity: 5,
            productId,
            branchId: otherBranchId,
          }),
        }),
      );

      expect(result.id).toBe('transfer-id');
      expect(auditService.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'TRANSFER', entity: 'Inventory' }),
      );
    });

    it('creates destination stock record when none exists at destination', async () => {
      // Destination stock not found → create
      tx.inventoryStock.findUnique
        // First call is for the source check inside the for loop error path (not reached)
        // Second call is for the destination — return null to trigger creation
        .mockResolvedValueOnce(null) // won't be the source's because source is the first hit
        .mockResolvedValueOnce(null);

      // Actually, let's be precise: the first findUnique is inside the for loop's error handling
      // (only reached if updateMany returns 0), and the second findUnique is for dest.
      // Since updateMany returns {count:1}, the first findUnique isn't called.
      // So let me set: first findUnique → dest check returns null, second → not called
      tx.inventoryStock.findUnique
        .mockReset()
        .mockResolvedValueOnce(null); // dest stock not found
      tx.inventoryStock.create.mockResolvedValue({
        id: 'new-stock-id', productId, branchId: otherBranchId, quantity: 5,
      });

      await service.transfer(dto, superAdminUser);

      // Destination stock was created
      expect(tx.inventoryStock.create).toHaveBeenCalledWith({
        data: {
          productId,
          branchId: otherBranchId,
          quantity: 5,
        },
      });
    });

    it('throws BadRequestException when source stock is insufficient', async () => {
      // Source stock updateMany returns count 0 (guard triggered)
      tx.inventoryStock.updateMany.mockResolvedValue({ count: 0 });

      // Error path reads current stock to build error message
      tx.inventoryStock.findUnique
        .mockReset()
        .mockResolvedValueOnce({ id: 'source-stock', quantity: 2 }); // only 2 available

      await expect(
        service.transfer(dto, superAdminUser),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // ========================================================================
  // getLowStockAlerts
  // ========================================================================
  describe('getLowStockAlerts', () => {
    it('reports items where stock quantity is at or below minStock', async () => {
      prisma.inventoryStock.findMany.mockResolvedValue([
        {
          id: 'stock-1', quantity: 0,
          product: { id: 'p1', sku: 'SKU-001', name: 'Run Out', barcode: '1', minStock: 10, unit: 'cái' },
          branch: { id: BRANCH_ID, name: 'Main', code: 'BR-001' },
        },
        {
          id: 'stock-2', quantity: 5,
          product: { id: 'p2', sku: 'SKU-002', name: 'Low', barcode: '2', minStock: 10, unit: 'cái' },
          branch: { id: BRANCH_ID, name: 'Main', code: 'BR-001' },
        },
        {
          id: 'stock-3', quantity: 20,
          product: { id: 'p3', sku: 'SKU-003', name: 'Healthy', barcode: '3', minStock: 10, unit: 'cái' },
          branch: { id: BRANCH_ID, name: 'Main', code: 'BR-001' },
        },
      ]);

      const result = await service.getLowStockAlerts(BRANCH_ID);

      // Only items where quantity <= minStock
      expect(result.total).toBe(2);
      expect(result.critical).toBe(1); // stock-1: quantity 0
      expect(result.warning).toBe(1);  // stock-2: quantity 5 <= 10

      // Items list has deficit computed
      expect(result.items[0].currentStock).toBe(0);
      expect(result.items[0].deficit).toBe(10); // minStock - qty = 10
      expect(result.items[1].currentStock).toBe(5);
      expect(result.items[1].deficit).toBe(5);
    });

    it('returns empty when no stock is below threshold', async () => {
      prisma.inventoryStock.findMany.mockResolvedValue([
        {
          id: 'stock-1', quantity: 50,
          product: { id: 'p1', sku: 'SKU-001', name: 'Ok', barcode: '1', minStock: 10, unit: 'cái' },
          branch: { id: BRANCH_ID, name: 'Main', code: 'BR-001' },
        },
      ]);

      const result = await service.getLowStockAlerts();

      expect(result.total).toBe(0);
      expect(result.critical).toBe(0);
      expect(result.warning).toBe(0);
    });
  });
});
