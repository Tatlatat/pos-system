import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateSupplierDto } from './dto/create-supplier.dto';
import { UpdateSupplierDto } from './dto/update-supplier.dto';
import { AuditService } from '../audit/audit.service';

@Injectable()
export class SuppliersService {
  constructor(
    private prisma: PrismaService,
    private auditService: AuditService,
  ) {}

  async create(dto: CreateSupplierDto, currentUserId: string) {
    const existing = await this.prisma.supplier.findUnique({ where: { code: dto.code } });
    if (existing) throw new ConflictException('Supplier code already exists');

    const supplier = await this.prisma.supplier.create({ data: dto });

    await this.auditService.log({
      userId: currentUserId,
      action: 'CREATE',
      entity: 'Supplier',
      entityId: supplier.id,
      newValue: { code: supplier.code, name: supplier.name },
    });

    return supplier;
  }

  async findAll(search?: string) {
    const where: any = {};
    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { code: { contains: search, mode: 'insensitive' } },
        { phone: { contains: search } },
      ];
    }
    return this.prisma.supplier.findMany({
      where,
      orderBy: { name: 'asc' },
    });
  }

  async findOne(id: string) {
    const supplier = await this.prisma.supplier.findUnique({
      where: { id },
      include: {
        purchaseOrders: {
          orderBy: { createdAt: 'desc' },
          take: 10,
        },
        _count: { select: { purchaseOrders: true, goodsReceipts: true } },
      },
    });
    if (!supplier) throw new NotFoundException('Supplier not found');
    return supplier;
  }

  async update(id: string, dto: UpdateSupplierDto, currentUserId: string) {
    const supplier = await this.prisma.supplier.findUnique({ where: { id } });
    if (!supplier) throw new NotFoundException('Supplier not found');

    const updated = await this.prisma.supplier.update({ where: { id }, data: dto });

    await this.auditService.log({
      userId: currentUserId,
      action: 'UPDATE',
      entity: 'Supplier',
      entityId: id,
      oldValue: { name: supplier.name },
      newValue: { name: updated.name },
    });

    return updated;
  }

  async toggleActive(id: string, currentUserId: string) {
    const supplier = await this.prisma.supplier.findUnique({ where: { id } });
    if (!supplier) throw new NotFoundException('Supplier not found');

    const updated = await this.prisma.supplier.update({
      where: { id },
      data: { isActive: !supplier.isActive },
    });

    await this.auditService.log({
      userId: currentUserId,
      action: updated.isActive ? 'ACTIVATE' : 'DEACTIVATE',
      entity: 'Supplier',
      entityId: id,
    });

    return updated;
  }
}
