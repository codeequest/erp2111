import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';
import type { CategoryInput, CategoryUpdate } from '@erp/shared';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);
const emptyToNull = ({ value }: { value: unknown }) => (value === '' ? null : value);

export class CreateCategoryDto implements CategoryInput {
  @ApiProperty({ example: 'Soft drinks' })
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name: string;

  @ApiPropertyOptional({ description: 'Leave empty for a top-level category' })
  @IsOptional()
  @Transform(emptyToNull)
  @IsUUID()
  parentId?: string | null;
}

export class UpdateCategoryDto implements CategoryUpdate {
  @ApiPropertyOptional()
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name?: string;

  @ApiPropertyOptional({ description: 'null moves the category to the top level' })
  @IsOptional()
  @Transform(emptyToNull)
  @IsUUID()
  parentId?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class CreateUnitDto {
  @ApiProperty({ example: 'CTN' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toUpperCase() : value))
  @IsString()
  @MinLength(1)
  @MaxLength(16)
  code: string;

  @ApiProperty({ example: 'Carton' })
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(60)
  name: string;
}
