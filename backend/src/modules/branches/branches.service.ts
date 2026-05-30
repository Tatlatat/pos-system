import { Injectable, NotFoundException, ConflictException, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateBranchDto } from './dto/create-branch.dto';
import { UpdateBranchDto } from './dto/update-branch.dto';
import { AuditService } from '../audit/audit.service';

@Injectable()
export class BranchesService {
  private readonly logger = new Logger(BranchesService.name);

  constructor(
    private prisma: PrismaService,
    private auditService: AuditService,
  ) {}

  async create(dto: CreateBranchDto, currentUserId: string) {
    const existing = await this.prisma.branch.findUnique({ where: { code: dto.code } });
    if (existing) throw new ConflictException('Branch code already exists');

    // 🛡️ Create branch + stock for all existing products in one transaction
    const branch = await this.prisma.$transaction(async (tx) => {
      const b = await tx.branch.create({ data: dto });

      // Auto-create stock records for all existing products
      const products = await tx.product.findMany({ select: { id: true } });
      if (products.length > 0) {
        await tx.inventoryStock.createMany({
          data: products.map(p => ({
            productId: p.id,
            branchId: b.id,
            quantity: 0,
          })),
          skipDuplicates: true,
        });
      }
      return b;
    });

    await this.auditService.log({
      userId: currentUserId,
      action: 'CREATE',
      entity: 'Branch',
      entityId: branch.id,
      newValue: { code: branch.code, name: branch.name },
    });

    this.logger.log(`Branch created: ${branch.name} (${branch.code})`);
    return branch;
  }

  async findAll() {
    return this.prisma.branch.findMany({
      include: {
        _count: { select: { users: true, sales: true } },
      },
      orderBy: { code: 'asc' },
    });
  }

  async findOne(id: string) {
    const branch = await this.prisma.branch.findUnique({
      where: { id },
      include: {
        users: { select: { id: true, fullName: true, email: true, role: true } },
        _count: { select: { sales: true, inventoryStocks: true } },
      },
    });
    if (!branch) throw new NotFoundException('Branch not found');
    return branch;
  }

  async update(id: string, dto: UpdateBranchDto, currentUserId: string) {
    const branch = await this.prisma.branch.findUnique({ where: { id } });
    if (!branch) throw new NotFoundException('Branch not found');

    if (dto.code && dto.code !== branch.code) {
      const existing = await this.prisma.branch.findUnique({ where: { code: dto.code } });
      if (existing) throw new ConflictException('Branch code already exists');
    }

    const updated = await this.prisma.branch.update({ where: { id }, data: dto });

    await this.auditService.log({
      userId: currentUserId,
      action: 'UPDATE',
      entity: 'Branch',
      entityId: id,
      oldValue: { name: branch.name, code: branch.code },
      newValue: { name: updated.name, code: updated.code },
    });

    return updated;
  }
}
