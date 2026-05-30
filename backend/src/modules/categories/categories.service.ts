import { Injectable, NotFoundException, ConflictException, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';
import { AuditService } from '../audit/audit.service';

@Injectable()
export class CategoriesService {
  private readonly logger = new Logger(CategoriesService.name);

  constructor(
    private prisma: PrismaService,
    private auditService: AuditService,
  ) {}

  async create(dto: CreateCategoryDto, currentUserId: string) {
    const existing = await this.prisma.category.findUnique({ where: { name: dto.name } });
    if (existing) throw new ConflictException('Category name already exists');

    const category = await this.prisma.category.create({ data: dto });

    await this.auditService.log({
      userId: currentUserId,
      action: 'CREATE',
      entity: 'Category',
      entityId: category.id,
      newValue: { name: category.name },
    });

    return category;
  }

  async findAll(search?: string) {
    const where: any = {};
    if (search) {
      where.name = { contains: search, mode: 'insensitive' };
    }
    return this.prisma.category.findMany({
      where,
      include: { _count: { select: { products: true } } },
      orderBy: { name: 'asc' },
    });
  }

  async findOne(id: string) {
    const category = await this.prisma.category.findUnique({
      where: { id },
      include: {
        products: {
          select: { id: true, sku: true, name: true, sellingPrice: true, isActive: true },
          orderBy: { name: 'asc' },
        },
      },
    });
    if (!category) throw new NotFoundException('Category not found');
    return category;
  }

  async update(id: string, dto: UpdateCategoryDto, currentUserId: string) {
    const category = await this.prisma.category.findUnique({ where: { id } });
    if (!category) throw new NotFoundException('Category not found');

    if (dto.name && dto.name !== category.name) {
      const existing = await this.prisma.category.findUnique({ where: { name: dto.name } });
      if (existing) throw new ConflictException('Category name already exists');
    }

    const updated = await this.prisma.category.update({ where: { id }, data: dto });

    await this.auditService.log({
      userId: currentUserId,
      action: 'UPDATE',
      entity: 'Category',
      entityId: id,
      oldValue: { name: category.name },
      newValue: { name: updated.name },
    });

    return updated;
  }

  async remove(id: string, currentUserId: string) {
    const category = await this.prisma.category.findUnique({
      where: { id },
      include: { _count: { select: { products: true } } },
    });
    if (!category) throw new NotFoundException('Category not found');
    if (category._count.products > 0) {
      throw new ConflictException('Cannot delete category with existing products. Disable it instead.');
    }

    await this.prisma.category.delete({ where: { id } });

    await this.auditService.log({
      userId: currentUserId,
      action: 'DELETE',
      entity: 'Category',
      entityId: id,
      oldValue: { name: category.name },
    });

    return { message: 'Category deleted successfully' };
  }
}
