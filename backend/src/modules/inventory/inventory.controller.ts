import {
  Controller, Get, Post, Body, Param, Query, UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { InventoryService } from './inventory.service';
import {
  StockInDto, StockOutDto, StockAdjustmentDto, TransferDto,
} from './dto/stock-in.dto';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { PrismaService } from '../../prisma/prisma.service';
import { JwtPayload } from '../auth/interfaces/jwt-payload.interface';

@ApiTags('Inventory')
@ApiBearerAuth()
@UseGuards(RolesGuard)
@Controller('inventory')
export class InventoryController {
  constructor(
    private inventoryService: InventoryService,
    private prisma: PrismaService,
  ) {}

  // ===== UC-11: Stock In =====
  @Post('stock-in')
  @Roles(UserRole.SUPER_ADMIN, UserRole.BRANCH_MANAGER, UserRole.INVENTORY_STAFF)
  @ApiOperation({ summary: 'Stock In — Increase inventory (purchase/return)' })
  async stockIn(@Body() dto: StockInDto, @CurrentUser() user: JwtPayload) {
    return this.inventoryService.stockIn(dto, user.branchId!, user.sub);
  }

  // ===== UC-12: Stock Out =====
  @Post('stock-out')
  @Roles(UserRole.SUPER_ADMIN, UserRole.BRANCH_MANAGER, UserRole.INVENTORY_STAFF)
  @ApiOperation({ summary: 'Stock Out — Decrease inventory (damage/loss)' })
  async stockOut(@Body() dto: StockOutDto, @CurrentUser() user: JwtPayload) {
    return this.inventoryService.stockOut(dto, user.branchId!, user.sub);
  }

  // ===== UC-13: Stock Adjustment =====
  @Post('adjust')
  @Roles(UserRole.SUPER_ADMIN, UserRole.BRANCH_MANAGER, UserRole.INVENTORY_STAFF)
  @ApiOperation({ summary: 'Stock Adjustment — Inventory count correction' })
  async adjust(@Body() dto: StockAdjustmentDto, @CurrentUser() user: JwtPayload) {
    return this.inventoryService.adjust(dto, user.branchId!, user.sub);
  }

  // ===== UC-14: Transfer =====
  @Post('transfer')
  @Roles(UserRole.SUPER_ADMIN, UserRole.BRANCH_MANAGER, UserRole.INVENTORY_STAFF)
  @ApiOperation({ summary: 'Transfer stock between branches' })
  async transfer(@Body() dto: TransferDto, @CurrentUser() user: JwtPayload) {
    return this.inventoryService.transfer(dto, user.sub);
  }

  // ===== UC-15: Low Stock Alert =====
  @Get('low-stock')
  @Roles(UserRole.SUPER_ADMIN, UserRole.BRANCH_MANAGER, UserRole.INVENTORY_STAFF, UserRole.OWNER)
  @ApiOperation({ summary: 'Get low stock alerts' })
  async getLowStockAlerts(@CurrentUser() user: JwtPayload) {
    return this.inventoryService.getLowStockAlerts(user.branchId || undefined);
  }

  // ===== Get stock by branch =====
  @Get('stock')
  @Roles(UserRole.SUPER_ADMIN, UserRole.BRANCH_MANAGER, UserRole.INVENTORY_STAFF)
  @ApiOperation({ summary: 'Get current stock levels by branch' })
  @ApiQuery({ name: 'productId', required: false })
  async getStock(@CurrentUser() user: JwtPayload, @Query('productId') productId?: string) {
    return this.inventoryService.getStock(user.branchId!, productId);
  }

  // ===== Transaction history =====
  @Get('transactions')
  @Roles(UserRole.SUPER_ADMIN, UserRole.BRANCH_MANAGER, UserRole.INVENTORY_STAFF)
  @ApiOperation({ summary: 'Get inventory transaction history (UC-34)' })
  @ApiQuery({ name: 'productId', required: false })
  async getTransactions(
    @CurrentUser() user: JwtPayload,
    @Query('productId') productId?: string,
    @Query('page') page = 1,
    @Query('limit') limit = 20,
  ) {
    return this.inventoryService.getTransactionHistory(user.branchId!, productId, +page, +limit);
  }

  // ===== Transfers list =====
  @Get('transfers')
  @Roles(UserRole.SUPER_ADMIN, UserRole.BRANCH_MANAGER, UserRole.INVENTORY_STAFF)
  @ApiOperation({ summary: 'List inventory transfers' })
  @ApiQuery({ name: 'page', required: false })
  async getTransfers(
    @Query('page') page = 1,
    @Query('limit') limit = 20,
  ) {
    const skip = (page - 1) * limit;
    const [data, total] = await Promise.all([
      this.prisma.inventoryTransfer.findMany({
        skip,
        take: Math.min(+limit, 100),
        include: {
          sourceBranch: { select: { id: true, name: true, code: true } },
          destBranch: { select: { id: true, name: true, code: true } },
          requestedBy: { select: { id: true, fullName: true } },
          items: {
            include: { product: { select: { id: true, sku: true, name: true } } },
          },
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.inventoryTransfer.count(),
    ]);

    return { data, total, page: +page, limit: +limit, totalPages: Math.ceil(total / limit) };
  }
}
