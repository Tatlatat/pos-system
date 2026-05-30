import { IsString, IsNumber, IsOptional, IsUUID, Min, IsEnum, IsArray, ArrayMinSize } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { PaymentMethod } from '@prisma/client';

export class AddToCartDto {
  @ApiProperty()
  @IsUUID()
  productId: string;

  @ApiProperty({ example: 1 })
  @IsNumber()
  @Min(1)
  quantity: number;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  barcode?: string;
}

export class UpdateCartItemDto {
  @ApiProperty()
  @IsNumber()
  @Min(0)
  quantity: number;
}

export class CheckoutDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsUUID()
  customerId?: string;

  @ApiProperty({ example: 0 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  discountAmount?: number;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiProperty({ type: () => [PaymentDto] })
  @IsArray()
  @ArrayMinSize(1)
  payments: PaymentDto[];
}

export class PaymentDto {
  @ApiProperty({ enum: PaymentMethod })
  @IsEnum(PaymentMethod)
  method: PaymentMethod;

  @ApiProperty()
  @IsNumber()
  @Min(0)
  amount: number;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  reference?: string; // Bank transaction code

  @ApiProperty({ required: false, default: 0 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  changeDue?: number;
}

export class ReturnItemDto {
  @ApiProperty()
  @IsUUID()
  saleItemId: string;

  @ApiProperty()
  @IsNumber()
  @Min(1)
  quantity: number;

  @ApiProperty({ required: false, default: 'GOOD' })
  @IsOptional()
  @IsString()
  condition?: string;
}

export class ReturnDto {
  @ApiProperty()
  @IsUUID()
  saleId: string;

  @ApiProperty()
  @IsString()
  reason: string;

  @ApiProperty({ type: () => [ReturnItemDto] })
  @IsArray()
  @ArrayMinSize(1)
  items: ReturnItemDto[];
}

export class CancelInvoiceDto {
  @ApiProperty()
  @IsString()
  reason: string;
}
