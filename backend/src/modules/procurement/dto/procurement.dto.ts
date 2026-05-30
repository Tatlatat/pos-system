import { IsString, IsNumber, IsUUID, IsOptional, Min, IsArray, ArrayMinSize, IsEnum } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { PurchaseOrderStatus } from '@prisma/client';

export class CreatePoItemDto {
  @ApiProperty()
  @IsUUID()
  productId: string;

  @ApiProperty()
  @IsNumber()
  @Min(1)
  quantity: number;

  @ApiProperty()
  @IsNumber()
  @Min(0)
  unitCost: number;
}

export class CreatePurchaseOrderDto {
  @ApiProperty()
  @IsUUID()
  supplierId: string;

  @ApiProperty({ type: () => [CreatePoItemDto] })
  @IsArray()
  @ArrayMinSize(1)
  items: CreatePoItemDto[];

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  notes?: string;
}

export class GoodsReceiptDto {
  @ApiProperty()
  @IsUUID()
  poId: string;

  @ApiProperty()
  @IsUUID()
  supplierId: string;

  @ApiProperty({ type: () => [GoodsReceiptItemDto] })
  @IsArray()
  @ArrayMinSize(1)
  items: GoodsReceiptItemDto[];

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  notes?: string;
}

export class GoodsReceiptItemDto {
  @ApiProperty()
  @IsUUID()
  productId: string;

  @ApiProperty()
  @IsUUID()
  poItemId: string;

  @ApiProperty()
  @IsNumber()
  @Min(1)
  quantity: number;

  @ApiProperty()
  @IsNumber()
  @Min(0)
  unitCost: number;
}
