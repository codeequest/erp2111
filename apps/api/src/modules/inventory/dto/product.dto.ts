import { ApiPropertyOptional, ApiProperty, PartialType } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import type {
  ProductInput,
  ProductListQuery,
  ProductSortField,
  ProductStatusFilter,
  SortOrder,
} from '@erp/shared';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);
/** Turns "" into null so optional fields can be cleared from a form. */
const emptyToNull = ({ value }: { value: unknown }) => {
  if (typeof value !== 'string') return value;
  const v = value.trim();
  return v === '' ? null : v;
};

export class ProductListQueryDto implements ProductListQuery {
  @ApiPropertyOptional({ description: 'Matches name, SKU or barcode' })
  @IsOptional()
  @IsString()
  @Transform(trim)
  search?: string;

  @ApiPropertyOptional({ description: 'Includes sub-categories' })
  @IsOptional()
  @IsUUID()
  categoryId?: string;

  @ApiPropertyOptional({ enum: ['active', 'inactive', 'all'], default: 'active' })
  @IsOptional()
  @IsIn(['active', 'inactive', 'all'])
  status?: ProductStatusFilter;

  @ApiPropertyOptional({ description: 'Only products below their minimum stock' })
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true' || value === '1')
  @IsBoolean()
  lowStock?: boolean;

  @ApiPropertyOptional({ enum: ['name', 'sku', 'salePrice', 'createdAt'], default: 'name' })
  @IsOptional()
  @IsIn(['name', 'sku', 'salePrice', 'createdAt'])
  sort?: ProductSortField;

  @ApiPropertyOptional({ enum: ['asc', 'desc'], default: 'asc' })
  @IsOptional()
  @IsIn(['asc', 'desc'])
  order?: SortOrder;

  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ default: 20, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number;
}

export class CreateProductDto implements ProductInput {
  @ApiProperty({ example: 'COKE-33CL' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toUpperCase() : value))
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  @Matches(/^[A-Z0-9._\-/]+$/, {
    message: 'sku may only contain letters, digits, dot, dash, underscore and slash',
  })
  sku: string;

  @ApiPropertyOptional({ example: '5449000000996' })
  @IsOptional()
  @Transform(emptyToNull)
  @IsString()
  @MaxLength(64)
  barcode?: string | null;

  @ApiProperty({ example: 'Coca-Cola 33cl can' })
  @Transform(trim)
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  name: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(emptyToNull)
  @IsString()
  @MaxLength(2000)
  description?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(emptyToNull)
  @IsUUID()
  categoryId?: string | null;

  @ApiProperty()
  @IsUUID()
  baseUnitId: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(emptyToNull)
  @IsUUID()
  taxRateId?: string | null;

  @ApiProperty({ example: 1.5 })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0)
  @Max(99_999_999_999)
  salePrice: number;

  @ApiProperty({ example: 24 })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0)
  @Max(99_999_999_999)
  minStock: number;
}

export class UpdateProductDto extends PartialType(CreateProductDto) {}
