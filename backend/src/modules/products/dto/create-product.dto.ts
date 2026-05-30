import {
  IsString, IsNumber, IsOptional, IsUUID, Min, IsBoolean, IsDecimal,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateProductDto {
  @ApiProperty({ example: 'SKU001' })
  @IsString()
  sku: string;

  @ApiProperty({ example: '8934567890123' })
  @IsString()
  barcode: string;

  @ApiProperty({ example: 'Coca Cola 330ml' })
  @IsString()
  name: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({ example: 'lon' })
  @IsOptional()
  @IsString()
  unit?: string;

  @ApiProperty({ example: 5000 })
  @IsNumber()
  @Min(0)
  costPrice: number;

  @ApiProperty({ example: 10000 })
  @IsNumber()
  @Min(0)
  sellingPrice: number;

  @ApiProperty({ example: 20 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  minStock?: number;

  @ApiProperty({ example: 8.0 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  taxRate?: number;

  @ApiProperty()
  @IsUUID()
  categoryId: string;
}
