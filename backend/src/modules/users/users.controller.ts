import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  Query,
  ForbiddenException,
  HttpCode,
  HttpStatus,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { UsersService } from './users.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtPayload } from '../auth/interfaces/jwt-payload.interface';

@ApiTags('Users')
@ApiBearerAuth()
@UseGuards(RolesGuard)
@Controller('users')
export class UsersController {
  constructor(private usersService: UsersService) {}

  @Post()
  @Roles(UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'Create user (Super Admin only)' })
  async create(@Body() dto: CreateUserDto, @CurrentUser() user: JwtPayload) {
    return this.usersService.create(dto, user.sub);
  }

  @Get()
  @Roles(UserRole.SUPER_ADMIN, UserRole.BRANCH_MANAGER, UserRole.OWNER)
  @ApiOperation({ summary: 'List all users (paginated)' })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  async findAll(@Query('page') page = 1, @Query('limit') limit = 20, @CurrentUser() user: JwtPayload) {
    if (user.role === UserRole.BRANCH_MANAGER && !user.branchId) {
      throw new ForbiddenException('Branch manager must be assigned to a branch');
    }
    const branchId = user.role === UserRole.BRANCH_MANAGER ? user.branchId || undefined : undefined;
    return this.usersService.findAll(+page, Math.min(+limit, 100), branchId);
  }

  @Get(':id')
  @Roles(UserRole.SUPER_ADMIN, UserRole.BRANCH_MANAGER)
  @ApiOperation({ summary: 'Get user by ID' })
  async findOne(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    if (user.role === UserRole.BRANCH_MANAGER && !user.branchId) {
      throw new ForbiddenException('Branch manager must be assigned to a branch');
    }
    const branchId = user.role === UserRole.BRANCH_MANAGER ? user.branchId || undefined : undefined;
    return this.usersService.findOne(id, branchId);
  }

  @Patch(':id')
  @Roles(UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'Update user (Super Admin only)' })
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateUserDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.usersService.update(id, dto, user.sub);
  }

  @Patch(':id/toggle-active')
  @Roles(UserRole.SUPER_ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Activate/Deactivate user' })
  async toggleActive(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.usersService.toggleActive(id, user.sub);
  }
}
