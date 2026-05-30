import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateCustomerDto, UpdateCustomerDto } from './dto/create-customer.dto';
import { AuditService } from '../audit/audit.service';

@Injectable()
export class CustomersService {
  constructor(
    private prisma: PrismaService,
    private auditService: AuditService,
  ) {}

  async create(dto: CreateCustomerDto, currentUserId: string) {
    const existing = await this.prisma.customer.findUnique({ where: { phone: dto.phone } });
    if (existing) throw new ConflictException('Phone number already registered');

    const customer = await this.prisma.customer.create({ data: dto });

    await this.auditService.log({
      userId: currentUserId,
      action: 'CREATE',
      entity: 'Customer',
      entityId: customer.id,
      newValue: { name: customer.name, phone: customer.phone },
    });

    return customer;
  }

  async findAll(page = 1, limit = 20, search?: string) {
    const skip = (page - 1) * limit;
    const where: any = {};

    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { phone: { contains: search } },
      ];
    }

    const [data, total] = await Promise.all([
      this.prisma.customer.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.customer.count({ where }),
    ]);

    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async findOne(id: string) {
    const customer = await this.prisma.customer.findUnique({
      where: { id },
      include: {
        sales: {
          take: 10,
          orderBy: { createdAt: 'desc' },
          include: {
            items: { include: { product: { select: { name: true } } } },
            payments: true,
          },
        },
        loyaltyTxns: { orderBy: { createdAt: 'desc' } },
      },
    });
    if (!customer) throw new NotFoundException('Customer not found');
    return customer;
  }

  async findByPhone(phone: string) {
    const customer = await this.prisma.customer.findUnique({
      where: { phone },
      include: {
        sales: {
          take: 5,
          orderBy: { createdAt: 'desc' },
          include: {
            items: { include: { product: { select: { name: true } } } },
            payments: true,
          },
        },
      },
    });
    if (!customer) throw new NotFoundException('Customer not found for this phone');
    return customer;
  }

  async update(id: string, dto: UpdateCustomerDto, currentUserId: string) {
    const customer = await this.prisma.customer.findUnique({ where: { id } });
    if (!customer) throw new NotFoundException('Customer not found');

    if (dto.phone && dto.phone !== customer.phone) {
      const existing = await this.prisma.customer.findUnique({ where: { phone: dto.phone } });
      if (existing) throw new ConflictException('Phone number already registered');
    }

    const updated = await this.prisma.customer.update({ where: { id }, data: dto });

    await this.auditService.log({
      userId: currentUserId,
      action: 'UPDATE',
      entity: 'Customer',
      entityId: id,
    });

    return updated;
  }
}
