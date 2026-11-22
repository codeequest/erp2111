import { ApiProperty, ApiPropertyOptional, PartialType, PickType } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import type { ProductSortField, ProductStatusFilter } from '@erp/shared';

/** Trims strings; turns "" into null so optional fields can be cleared. */
const trimToNull = ({ value }: { value: unknown }) => {
  if (typeof value !== 'string') return value;
  const t = value.trim();
  return t === '' ? null : t;
};
const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

const MONEY = { maxDecimalPlaces: 4 } as const;
const MAX_AMOUNT = 99_999_999_999_999; // fits Decimal(18, 4)

export class CreateProductDto {
  @ApiProperty({ example: 'COF-500' })
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  sku: string;

  @ApiPropertyOptional({ example: '6191234567890', nullable: true })
  @Transform(trimToNull)
  @IsOptional()
  @IsString()
  @MaxLength(64)
  barcode?: string | null;

  @ApiProperty({ example: 'Ground coffee 500 g' })
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name: string;

  @ApiPropertyOptional({ nullable: true })
  @Transform(trimToNull)
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string | null;

  @ApiPropertyOptional({ format: 'uuid', nullable: true })
  @Transform(trimToNull)
  @IsOptional()
  @IsUUID()
  categoryId?: string | null;

  @ApiProperty({ format: 'uuid', description: 'Stock is kept in this unit' })
  @IsUUID()
  baseUnitId: string;

  @ApiPropertyOptional({ format: 'uuid', nullable: true })
  @Transform(trimToNull)
  @IsOptional()
  @IsUUID()
  taxRateId?: string | null;

  @ApiProperty({ example: 12.5 })
  @IsNumber(MONEY)
  @Min(0)
  @Max(MAX_AMOUNT)
  salePrice: number;

  @ApiPropertyOptional({ example: 10, description: 'Low-stock threshold, in the base unit' })
  @IsOptional()
  @IsNumber(MONEY)
  @Min(0)
  @Max(MAX_AMOUNT)
  minStock?: number;
}

/** Every field optional. Average cost is never editable here (it comes from receipts). */
export class UpdateProductDto extends PartialType(CreateProductDto) {}

export class ListProductsQueryDto {
  @ApiPropertyOptional({ description: 'Matches SKU, barcode or name' })
  @Transform(trim)
  @IsOptional()
  @IsString()
  @MaxLength(100)
  search?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  categoryId?: string;

  @ApiPropertyOptional({ enum: ['active', 'inactive', 'all'], default: 'active' })
  @IsOptional()
  @IsIn(['active', 'inactive', 'all'])
  status: ProductStatusFilter = 'active';

  @ApiPropertyOptional({ enum: ['name', 'sku', 'salePrice', 'createdAt'], default: 'name' })
  @IsOptional()
  @IsIn(['name', 'sku', 'salePrice', 'createdAt'])
  sort: ProductSortField = 'name';

  @ApiPropertyOptional({ enum: ['asc', 'desc'], default: 'asc' })
  @IsOptional()
  @IsIn(['asc', 'desc'])
  order: 'asc' | 'desc' = 'asc';

  @ApiPropertyOptional({ default: 1, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;

  @ApiPropertyOptional({ default: 25, minimum: 1, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize: number = 25;
}

/** Same filters and sort as the list, without pagination (every matching product). */
export class ExportProductsQueryDto extends PickType(ListProductsQueryDto, [
  'search',
  'categoryId',
  'status',
  'sort',
  'order',
] as const) {}
