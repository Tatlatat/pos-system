import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { AuditService } from './audit.service';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtPayload } from '../auth/interfaces/jwt-payload.interface';

@ApiTags('Audit Logs')
@ApiBearerAuth()
@UseGuards(RolesGuard)
@Controller('audit')
export class AuditController {
  constructor(private auditService: AuditService) {}

  @Get()
  @Roles(UserRole.SUPER_ADMIN, UserRole.BRANCH_MANAGER, UserRole.OWNER)
  @ApiOperation({ summary: 'Get user activity logs (paginated)' })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  @ApiQuery({ name: 'userId', required: false })
  @ApiQuery({ name: 'entity', required: false })
  @ApiQuery({ name: 'action', required: false })
  async findAll(
    @Query('page') page = 1,
    @Query('limit') limit = 20,
    @Query('userId') userId?: string,
    @Query('entity') entity?: string,
    @Query('action') action?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @CurrentUser() user?: JwtPayload,
  ) {
    // BranchManager chỉ thấy logs của branch mình
    const branchFilter = user?.role === 'BRANCH_MANAGER' ? (user.branchId ?? undefined) : undefined;
    return this.auditService.findAll(+page, Math.min(+limit, 100), {
      userId,
      entity,
      action,
      startDate,
      endDate,
      branchId: branchFilter,
    });
  }

  @Get('inventory')
  @Roles(UserRole.SUPER_ADMIN, UserRole.BRANCH_MANAGER, UserRole.INVENTORY_STAFF)
  @ApiOperation({ summary: 'Get inventory change logs' })
  async findInventoryLog(
    @Query('page') page = 1,
    @Query('limit') limit = 20,
    @Query('productId') productId?: string,
    @Query('branchId') branchId?: string,
    @Query('type') type?: string,
    @CurrentUser() user?: JwtPayload,
  ) {
    // BranchManager chỉ thấy inventory logs của branch mình
    const branchFilter = user?.role === 'BRANCH_MANAGER'
      ? (user.branchId || undefined)
      : branchId || undefined;
    return this.auditService.findInventoryLog(+page, Math.min(+limit, 100), {
      productId,
      branchId: branchFilter,
      type,
    });
  }
}
