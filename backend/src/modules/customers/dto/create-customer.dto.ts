import { IsString, IsOptional, IsEmail, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateCustomerDto {
  @ApiProperty({ example: 'Nguyễn Văn C' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({ example: '0909876543' })
  @IsString()
  @IsNotEmpty()
  phone: string;

  @ApiProperty({ example: 'customer@gmail.com', required: false })
  @IsOptional()
  @IsEmail()
  email?: string;
}

export class UpdateCustomerDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsEmail()
  email?: string;
}
