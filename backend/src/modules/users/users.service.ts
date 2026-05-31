import {
  Injectable,
  NotFoundException,
  ConflictException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { AuditService } from '../audit/audit.service';

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);

  constructor(
    private prisma: PrismaService,
    private auditService: AuditService,
  ) {}

  async create(dto: CreateUserDto, currentUserId: string) {
    const existing = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (existing) {
      throw new ConflictException('Email already exists');
    }

    const passwordHash = await bcrypt.hash(dto.password, 10);

    const user = await this.prisma.user.create({
      data: {
        email: dto.email,
        passwordHash,
        fullName: dto.fullName,
        phone: dto.phone,
        role: dto.role,
        branchId: dto.branchId || null,
      },
      select: {
        id: true,
        email: true,
        fullName: true,
        phone: true,
        role: true,
        branchId: true,
        isActive: true,
        createdAt: true,
      },
    });

    await this.auditService.log({
      userId: currentUserId,
      action: 'CREATE',
      entity: 'User',
      entityId: user.id,
      newValue: { email: user.email, role: user.role },
    });

    this.logger.log(`User created: ${user.email} (${user.role})`);
    return user;
  }

  async findAll(page = 1, limit = 20, branchId?: string) {
    const skip = (page - 1) * limit;
    const where: any = {};
    if (branchId) where.branchId = branchId;

    const [data, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        skip,
        take: limit,
        select: {
          id: true,
          email: true,
          fullName: true,
          phone: true,
          role: true,
          branchId: true,
          branch: { select: { id: true, name: true, code: true } },
          isActive: true,
          lastLoginAt: true,
          createdAt: true,
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.user.count({ where }),
    ]);

    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async findOne(id: string, branchId?: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        email: true,
        fullName: true,
        phone: true,
        role: true,
        branchId: true,
        branch: { select: { id: true, name: true, code: true } },
        isActive: true,
        lastLoginAt: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!user) throw new NotFoundException('User not found');
    if (branchId && user.branchId !== branchId) {
      throw new ForbiddenException('You can only view users from your assigned branch');
    }
    return user;
  }

  async update(id: string, dto: UpdateUserDto, currentUserId: string) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundException('User not found');

    const updateData: any = {};
    if (dto.fullName) updateData.fullName = dto.fullName;
    if (dto.phone) updateData.phone = dto.phone;
    if (dto.role) updateData.role = dto.role;
    if (dto.branchId !== undefined) updateData.branchId = dto.branchId || null;
    if (dto.email && dto.email !== user.email) {
      const existing = await this.prisma.user.findUnique({ where: { email: dto.email } });
      if (existing) throw new ConflictException('Email already exists');
      updateData.email = dto.email;
    }
    if (dto.password) {
      updateData.passwordHash = await bcrypt.hash(dto.password, 10);
    }

    const updated = await this.prisma.user.update({
      where: { id },
      data: updateData,
      select: {
        id: true,
        email: true,
        fullName: true,
        phone: true,
        role: true,
        branchId: true,
        isActive: true,
      },
    });

    await this.auditService.log({
      userId: currentUserId,
      action: 'UPDATE',
      entity: 'User',
      entityId: id,
      oldValue: { email: user.email, role: user.role },
      newValue: { email: updated.email, role: updated.role },
    });

    return updated;
  }

  async toggleActive(id: string, currentUserId: string) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundException('User not found');

    const updated = await this.prisma.user.update({
      where: { id },
      data: { isActive: !user.isActive, refreshToken: null },
      select: { id: true, email: true, isActive: true },
    });

    await this.auditService.log({
      userId: currentUserId,
      action: updated.isActive ? 'ACTIVATE' : 'DEACTIVATE',
      entity: 'User',
      entityId: id,
      oldValue: { isActive: user.isActive },
      newValue: { isActive: updated.isActive },
    });

    return updated;
  }
}
