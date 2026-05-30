import { IsString, IsOptional } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateBranchDto {
  @ApiProperty({ example: 'BR-001' })
  @IsString()
  code: string;

  @ApiProperty({ example: 'Chi nhánh Trung tâm' })
  @IsString()
  name: string;

  @ApiProperty({ example: '123 Nguyễn Huệ, Q.1, TP.HCM' })
  @IsOptional()
  @IsString()
  address?: string;

  @ApiProperty({ example: '0281234567' })
  @IsOptional()
  @IsString()
  phone?: string;
}
