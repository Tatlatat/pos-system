import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { ReportsService } from './reports.service';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtPayload } from '../auth/interfaces/jwt-payload.interface';

@ApiTags('Reports')
@ApiBearerAuth()
@UseGuards(RolesGuard)
@Controller('reports')
export class ReportsController {
  constructor(private reportsService: ReportsService) {}

  @Get('daily-sales')
  @Roles(UserRole.SUPER_ADMIN, UserRole.BRANCH_MANAGER, UserRole.OWNER)
  @ApiOperation({ summary: 'Daily Sales Report (UC-28)' })
  @ApiQuery({ name: 'date', required: false })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  async getDailySales(
    @Query('date') date?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @CurrentUser() user?: JwtPayload,
  ) {
    const branchId = user?.role === UserRole.OWNER || user?.role === UserRole.SUPER_ADMIN
      ? undefined
      : user?.branchId;
    return this.reportsService.getDailySalesReport(date, branchId || undefined, page ? +page : 1, limit ? +limit : 50);
  }

  @Get('product-sales')
  @Roles(UserRole.SUPER_ADMIN, UserRole.BRANCH_MANAGER, UserRole.OWNER)
  @ApiOperation({ summary: 'Product Sales Report — Top/Bottom (UC-29)' })
  async getProductSales(
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('limit') limit = 20,
    @CurrentUser() user?: JwtPayload,
  ) {
    const branchId = user?.role === UserRole.OWNER || user?.role === UserRole.SUPER_ADMIN
      ? undefined
      : user?.branchId;
    return this.reportsService.getProductSalesReport(startDate, endDate, branchId || undefined, +limit);
  }

  @Get('inventory-valuation')
  @Roles(UserRole.SUPER_ADMIN, UserRole.BRANCH_MANAGER, UserRole.INVENTORY_STAFF, UserRole.OWNER)
  @ApiOperation({ summary: 'Inventory Valuation Report (UC-30)' })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  async getInventoryValuation(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @CurrentUser() user?: JwtPayload,
  ) {
    const branchId = user?.role === UserRole.OWNER || user?.role === UserRole.SUPER_ADMIN
      ? undefined
      : user?.branchId;
    return this.reportsService.getInventoryValuation(branchId || undefined, page ? +page : 1, limit ? +limit : 50);
  }

  @Get('profit')
  @Roles(UserRole.SUPER_ADMIN, UserRole.BRANCH_MANAGER, UserRole.OWNER)
  @ApiOperation({ summary: 'Profit Report — Revenue - COGS = Profit (UC-31)' })
  async getProfitReport(
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @CurrentUser() user?: JwtPayload,
  ) {
    const branchId = user?.role === UserRole.OWNER || user?.role === UserRole.SUPER_ADMIN
      ? undefined
      : user?.branchId;
    return this.reportsService.getProfitReport(startDate, endDate, branchId || undefined);
  }

  @Get('cashier-performance')
  @Roles(UserRole.SUPER_ADMIN, UserRole.BRANCH_MANAGER, UserRole.OWNER)
  @ApiOperation({ summary: 'Cashier Performance Report (UC-32)' })
  async getCashierPerformance(
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @CurrentUser() user?: JwtPayload,
  ) {
    const branchId = user?.role === UserRole.OWNER || user?.role === UserRole.SUPER_ADMIN
      ? undefined
      : user?.branchId;
    return this.reportsService.getCashierPerformance(startDate, endDate, branchId || undefined);
  }
}
