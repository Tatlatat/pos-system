import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { DashboardService } from './dashboard.service';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtPayload } from '../auth/interfaces/jwt-payload.interface';

@ApiTags('Dashboard')
@ApiBearerAuth()
@UseGuards(RolesGuard)
@Controller('dashboard')
export class DashboardController {
  constructor(private dashboardService: DashboardService) {}

  @Get()
  @Roles(UserRole.SUPER_ADMIN, UserRole.BRANCH_MANAGER, UserRole.OWNER)
  @ApiOperation({ summary: 'Get dashboard summary data' })
  async getDashboard(@CurrentUser() user: JwtPayload) {
    const branchId = user.role === UserRole.OWNER || user.role === UserRole.SUPER_ADMIN
      ? undefined
      : user.branchId;
    return this.dashboardService.getDashboardSummary(branchId || undefined);
  }
}
