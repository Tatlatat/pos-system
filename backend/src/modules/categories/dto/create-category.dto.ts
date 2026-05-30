import { IsString, IsOptional } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateCategoryDto {
  @ApiProperty({ example: 'Đồ uống' })
  @IsString()
  name: string;

  @ApiProperty({ example: 'Nước ngọt, nước khoáng, bia, rượu', required: false })
  @IsOptional()
  @IsString()
  description?: string;
}
