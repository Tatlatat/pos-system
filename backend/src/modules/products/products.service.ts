import {
  Injectable, NotFoundException, ConflictException, Logger,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { SearchProductDto } from './dto/search-product.dto';
import { AuditService } from '../audit/audit.service';

@Injectable()
export class ProductsService {
  private readonly logger = new Logger(ProductsService.name);

  constructor(
    private prisma: PrismaService,
    private auditService: AuditService,
  ) {}

  async create(dto: CreateProductDto, currentUserId: string) {
    // Check SKU uniqueness
    const skuExists = await this.prisma.product.findUnique({ where: { sku: dto.sku } });
    if (skuExists) throw new ConflictException('SKU already exists');

    // Check barcode uniqueness
    const barcodeExists = await this.prisma.product.findUnique({ where: { barcode: dto.barcode } });
    if (barcodeExists) throw new ConflictException('Barcode already exists');

    // Check category exists
    const category = await this.prisma.category.findUnique({ where: { id: dto.categoryId } });
    if (!category) throw new NotFoundException('Category not found');

    // 🛡️ Product + stock creation in single transaction (prevents orphan product)
    const product = await this.prisma.$transaction(async (tx) => {
      const created = await tx.product.create({
        data: {
          sku: dto.sku,
          barcode: dto.barcode,
          name: dto.name,
          description: dto.description,
          unit: dto.unit || 'cái',
          costPrice: dto.costPrice,
          sellingPrice: dto.sellingPrice,
          minStock: dto.minStock || 0,
          taxRate: dto.taxRate ?? 8.0,
          categoryId: dto.categoryId,
        },
        include: { category: { select: { id: true, name: true } } },
      });

      // Automatically create inventory stock record for all branches
      const branches = await tx.branch.findMany({ select: { id: true } });
      if (branches.length > 0) {
        await tx.inventoryStock.createMany({
          data: branches.map((b) => ({
            productId: created.id,
            branchId: b.id,
            quantity: 0,
          })),
          skipDuplicates: true,
        });
      }
      return created;
    });

    await this.auditService.log({
      userId: currentUserId,
      action: 'CREATE',
      entity: 'Product',
      entityId: product.id,
      newValue: { sku: product.sku, name: product.name, price: Number(product.sellingPrice) },
    });

    this.logger.log(`Product created: ${product.name} (${product.sku})`);
    return product;
  }

  async search(dto: SearchProductDto) {
    const page = dto.page || 1;
    const limit = Math.min(dto.limit || 20, 100);
    const skip = (page - 1) * limit;

    const where: any = {};

    if (dto.sku) where.sku = { contains: dto.sku, mode: 'insensitive' };
    if (dto.barcode) where.barcode = { contains: dto.barcode };
    if (dto.name) where.name = { contains: dto.name, mode: 'insensitive' };
    if (dto.categoryId) where.categoryId = dto.categoryId;
    if (dto.isActive !== undefined) {
      where.isActive = dto.isActive === 'true';
    }

    const [data, total] = await Promise.all([
      this.prisma.product.findMany({
        where,
        skip,
        take: limit,
        include: {
          category: { select: { id: true, name: true } },
          inventoryStocks: {
            select: { branchId: true, quantity: true, branch: { select: { name: true } } },
          },
        },
        orderBy: { name: 'asc' },
      }),
      this.prisma.product.count({ where }),
    ]);

    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async findByBarcode(barcode: string) {
    const product = await this.prisma.product.findUnique({
      where: { barcode },
      include: {
        category: { select: { id: true, name: true } },
        inventoryStocks: {
          select: { branchId: true, quantity: true, branch: { select: { name: true } } },
        },
      },
    });
    if (!product) throw new NotFoundException('Product not found for this barcode');
    return product;
  }

  async findOne(id: string) {
    const product = await this.prisma.product.findUnique({
      where: { id },
      include: {
        category: { select: { id: true, name: true } },
        inventoryStocks: {
          select: { branchId: true, quantity: true, branch: { select: { name: true, code: true } } },
        },
      },
    });
    if (!product) throw new NotFoundException('Product not found');
    return product;
  }

  async update(id: string, dto: UpdateProductDto, currentUserId: string) {
    const product = await this.prisma.product.findUnique({ where: { id } });
    if (!product) throw new NotFoundException('Product not found');

    if (dto.sku && dto.sku !== product.sku) {
      const existing = await this.prisma.product.findUnique({ where: { sku: dto.sku } });
      if (existing) throw new ConflictException('SKU already exists');
    }

    if (dto.barcode && dto.barcode !== product.barcode) {
      const existing = await this.prisma.product.findUnique({ where: { barcode: dto.barcode } });
      if (existing) throw new ConflictException('Barcode already exists');
    }

    if (dto.categoryId) {
      const category = await this.prisma.category.findUnique({ where: { id: dto.categoryId } });
      if (!category) throw new NotFoundException('Category not found');
    }

    const updated = await this.prisma.product.update({
      where: { id },
      data: dto,
      include: { category: { select: { id: true, name: true } } },
    });

    await this.auditService.log({
      userId: currentUserId,
      action: 'UPDATE',
      entity: 'Product',
      entityId: id,
      oldValue: { name: product.name, price: Number(product.sellingPrice) },
      newValue: { name: updated.name, price: Number(updated.sellingPrice) },
    });

    return updated;
  }

  async toggleActive(id: string, currentUserId: string) {
    const product = await this.prisma.product.findUnique({ where: { id } });
    if (!product) throw new NotFoundException('Product not found');

    const updated = await this.prisma.product.update({
      where: { id },
      data: { isActive: !product.isActive },
    });

    await this.auditService.log({
      userId: currentUserId,
      action: updated.isActive ? 'ACTIVATE' : 'DEACTIVATE',
      entity: 'Product',
      entityId: id,
      oldValue: { isActive: product.isActive },
      newValue: { isActive: updated.isActive },
    });

    return updated;
  }
}
