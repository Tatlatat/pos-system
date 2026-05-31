import {
  Controller, Get, Post, Patch, Delete,
  Body, Param, Query, UseGuards, ForbiddenException,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { PosService } from './pos.service';
import {
  AddToCartDto, CheckoutDto, UpdateCartItemDto, ReturnDto, CancelInvoiceDto,
} from './dto/pos.dto';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtPayload } from '../auth/interfaces/jwt-payload.interface';

@ApiTags('Point of Sale')
@ApiBearerAuth()
@UseGuards(RolesGuard)
@Controller('pos')
export class PosController {
  constructor(private posService: PosService) {}

  // ===== Cart =====
  @Get('cart')
  @Roles(UserRole.CASHIER, UserRole.BRANCH_MANAGER)
  @ApiOperation({ summary: 'Get active cart for current cashier' })
  async getCart(@CurrentUser() user: JwtPayload) {
    return this.posService.getActiveCart(user.sub, user.branchId!);
  }

  @Post('cart/add')
  @Roles(UserRole.CASHIER, UserRole.BRANCH_MANAGER)
  @ApiOperation({ summary: 'Add product to cart' })
  async addToCart(@Body() dto: AddToCartDto, @CurrentUser() user: JwtPayload) {
    return this.posService.addToCart(dto, user.sub, user.branchId!);
  }

  @Post('cart/scan')
  @Roles(UserRole.CASHIER, UserRole.BRANCH_MANAGER)
  @ApiOperation({ summary: 'Scan barcode — auto add product (UC-17)' })
  async scanBarcode(@Body('barcode') barcode: string, @CurrentUser() user: JwtPayload) {
    return this.posService.scanBarcode(barcode, user.sub, user.branchId!);
  }

  @Patch('cart/item/:itemId')
  @Roles(UserRole.CASHIER, UserRole.BRANCH_MANAGER)
  @ApiOperation({ summary: 'Update cart item quantity' })
  async updateCartItem(
    @Param('itemId') itemId: string,
    @Body() dto: UpdateCartItemDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.posService.updateCartItem(itemId, dto, user.sub);
  }

  @Delete('cart/item/:itemId')
  @Roles(UserRole.CASHIER, UserRole.BRANCH_MANAGER)
  @ApiOperation({ summary: 'Remove item from cart' })
  async removeCartItem(@Param('itemId') itemId: string, @CurrentUser() user: JwtPayload) {
    return this.posService.removeCartItem(itemId, user.sub);
  }

  @Post('cart/customer')
  @Roles(UserRole.CASHIER, UserRole.BRANCH_MANAGER)
  @ApiOperation({ summary: 'Set customer for cart' })
  async setCartCustomer(@Body('customerId') customerId: string, @CurrentUser() user: JwtPayload) {
    return this.posService.setCartCustomer(customerId, user.sub);
  }

  // ===== Checkout =====
  @Post('checkout')
  @Roles(UserRole.CASHIER, UserRole.BRANCH_MANAGER)
  @ApiOperation({ summary: 'Checkout — complete sale (UC-18)' })
  async checkout(@Body() dto: CheckoutDto, @CurrentUser() user: JwtPayload) {
    return this.posService.checkout(dto, user.sub, user.branchId!);
  }

  // ===== Receipt =====
  @Get('receipt/:saleId')
  @Roles(UserRole.CASHIER, UserRole.BRANCH_MANAGER, UserRole.OWNER)
  @ApiOperation({ summary: 'Get sale receipt data (UC-19)' })
  async getReceipt(@Param('saleId') saleId: string, @CurrentUser() user: JwtPayload) {
    return this.posService.getReceipt(saleId, user);
  }

  // ===== Return =====
  @Post('return')
  @Roles(UserRole.BRANCH_MANAGER, UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'Return products (UC-20) — Manager only' })
  async returnProducts(@Body() dto: ReturnDto, @CurrentUser() user: JwtPayload) {
    return this.posService.returnProducts(dto, user);
  }

  // ===== Cancel Invoice =====
  @Post('cancel/:saleId')
  @Roles(UserRole.BRANCH_MANAGER, UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'Cancel invoice (UC-21) — Manager only' })
  async cancelInvoice(
    @Param('saleId') saleId: string,
    @Body() dto: CancelInvoiceDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.posService.cancelInvoice(saleId, dto, user);
  }

  // ===== Sales list =====
  @Get('sales')
  @Roles(UserRole.CASHIER, UserRole.BRANCH_MANAGER, UserRole.OWNER)
  @ApiOperation({ summary: 'List sales for branch' })
  @ApiQuery({ name: 'page', required: false })
  async listSales(
    @CurrentUser() user: JwtPayload,
    @Query('page') page = 1,
    @Query('limit') limit = 20,
  ) {
    if (user.role !== UserRole.OWNER && user.role !== UserRole.SUPER_ADMIN && !user.branchId) {
      throw new ForbiddenException('User must be assigned to a branch');
    }
    const branchId = user.role === UserRole.OWNER || user.role === UserRole.SUPER_ADMIN
      ? undefined
      : user.branchId || undefined;
    return this.posService.listSales(branchId, +page, +limit);
  }
}
