import {
  Controller, Get, Post, Patch,
  Body, Param, Query, UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { ProcurementService } from './procurement.service';
import { CreatePurchaseOrderDto, GoodsReceiptDto } from './dto/procurement.dto';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtPayload } from '../auth/interfaces/jwt-payload.interface';

@ApiTags('Procurement')
@ApiBearerAuth()
@UseGuards(RolesGuard)
@Controller('procurement')
export class ProcurementController {
  constructor(private procurementService: ProcurementService) {}

  // ===== Purchase Orders =====
  @Post('purchase-orders')
  @Roles(UserRole.SUPER_ADMIN, UserRole.BRANCH_MANAGER, UserRole.INVENTORY_STAFF)
  @ApiOperation({ summary: 'Create Purchase Order (UC-22)' })
  async createPO(@Body() dto: CreatePurchaseOrderDto, @CurrentUser() user: JwtPayload) {
    return this.procurementService.createPO(dto, user.sub);
  }

  @Get('purchase-orders')
  @Roles(UserRole.SUPER_ADMIN, UserRole.BRANCH_MANAGER, UserRole.INVENTORY_STAFF, UserRole.OWNER)
  @ApiOperation({ summary: 'List Purchase Orders' })
  async listPOs(
    @Query('page') page = 1,
    @Query('limit') limit = 20,
    @Query('status') status?: string,
  ) {
    return this.procurementService.listPOs(+page, +limit, status);
  }

  @Get('purchase-orders/:id')
  @Roles(UserRole.SUPER_ADMIN, UserRole.BRANCH_MANAGER, UserRole.INVENTORY_STAFF)
  @ApiOperation({ summary: 'Get PO details' })
  async findPO(@Param('id') id: string) {
    return this.procurementService.findPO(id);
  }

  @Patch('purchase-orders/:id/approve')
  @Roles(UserRole.SUPER_ADMIN, UserRole.BRANCH_MANAGER)
  @ApiOperation({ summary: 'Approve Purchase Order (UC-23)' })
  async approvePO(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.procurementService.approvePO(id, user.sub);
  }

  @Patch('purchase-orders/:id/reject')
  @Roles(UserRole.SUPER_ADMIN, UserRole.BRANCH_MANAGER)
  @ApiOperation({ summary: 'Reject Purchase Order' })
  async rejectPO(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.procurementService.rejectPO(id, user.sub);
  }

  // ===== Goods Receipt =====
  @Post('goods-receipt')
  @Roles(UserRole.SUPER_ADMIN, UserRole.BRANCH_MANAGER, UserRole.INVENTORY_STAFF)
  @ApiOperation({ summary: 'Receive goods from PO (UC-24)' })
  async receiveGoods(@Body() dto: GoodsReceiptDto, @CurrentUser() user: JwtPayload) {
    return this.procurementService.receiveGoods(dto, user.branchId!, user.sub);
  }

  @Get('goods-receipts')
  @Roles(UserRole.SUPER_ADMIN, UserRole.BRANCH_MANAGER, UserRole.INVENTORY_STAFF)
  @ApiOperation({ summary: 'List Goods Receipts' })
  async listGoodsReceipts(@Query('page') page = 1, @Query('limit') limit = 20) {
    return this.procurementService.listGoodsReceipts(+page, +limit);
  }
}
