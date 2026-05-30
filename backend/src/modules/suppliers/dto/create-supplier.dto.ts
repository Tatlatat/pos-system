import { IsString, IsOptional, IsEmail, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateSupplierDto {
  @ApiProperty({ example: 'SUP-001' })
  @IsString()
  @IsNotEmpty()
  code: string;

  @ApiProperty({ example: 'Công ty TNHH Thực phẩm ABC' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({ example: 'Nguyễn Văn B', required: false })
  @IsOptional()
  @IsString()
  contactPerson?: string;

  @ApiProperty({ example: '0901234567', required: false })
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiProperty({ example: 'contact@abc.com', required: false })
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiProperty({ example: '123 Lý Thường Kiệt, TP.HCM', required: false })
  @IsOptional()
  @IsString()
  address?: string;
}
