import { ApiPropertyOptional, ApiProperty, PartialType } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';
import type { ProductSortField, ProductStatusFilter, TrackingMode } from '@erp/shared';

/** Non-negative decimal with up to 4 places, sent as a string to keep precision. */
const DECIMAL_4 = /^\d{1,14}(\.\d{1,4})?$/;
const DECIMAL_MSG = 'must be a non-negative number with at most 4 decimals, sent as a string';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

export class CreateProductDto {
  @ApiPropertyOptional({
    example: 'BEV-COLA-33',
    nullable: true,
    description: 'Article code. Leave empty to get the next automatic code (e.g. ART-00042).',
  })
  @Transform(trim)
  @ValidateIf((_o, v) => v !== null && v !== undefined && v !== '')
  @IsString()
  @MaxLength(64)
  @Matches(/^[A-Za-z0-9._\-/]+$/, {
    message: 'sku may only contain letters, digits and . _ - /',
  })
  sku?: string | null;

  @ApiPropertyOptional({ example: '5449000000996', nullable: true })
  @Transform(trim)
  @IsOptional()
  @IsString()
  @MaxLength(64)
  barcode?: string | null;

  @ApiProperty({ example: 'Cola 33cl can' })
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  name: string;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string | null;

  @ApiPropertyOptional({ format: 'uuid', nullable: true })
  @ValidateIf((_o, v) => v !== null && v !== undefined && v !== '')
  @IsUUID()
  categoryId?: string | null;

  @ApiProperty({ format: 'uuid', description: 'Stock is kept in this unit' })
  @IsUUID()
  baseUnitId: string;

  @ApiPropertyOptional({ format: 'uuid', nullable: true })
  @ValidateIf((_o, v) => v !== null && v !== undefined && v !== '')
  @IsUUID()
  taxRateId?: string | null;

  @ApiProperty({ example: '1.2500', description: 'Sale price per base unit' })
  @Matches(DECIMAL_4, { message: `salePrice ${DECIMAL_MSG}` })
  salePrice: string;

  @ApiPropertyOptional({ example: '24', description: 'Low-stock threshold in base unit' })
  @IsOptional()
  @Matches(DECIMAL_4, { message: `minStock ${DECIMAL_MSG}` })
  minStock?: string;

  @ApiPropertyOptional({
    enum: ['NONE', 'LOT', 'SERIAL'],
    default: 'NONE',
    description: 'Lot / serial tracking. Locked once the product has stock movements.',
  })
  @IsOptional()
  @IsIn(['NONE', 'LOT', 'SERIAL'])
  tracking?: TrackingMode;
}

/**
 * Every field optional. averageCost is not accepted: only goods receipts change it.
 * An empty sku is refused on update (a product always keeps a code).
 */
export class UpdateProductDto extends PartialType(CreateProductDto) {}

export class ListProductsQueryDto {
  @ApiPropertyOptional({ default: 1, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page = 1;

  @ApiPropertyOptional({ default: 25, minimum: 1, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize = 25;

  @ApiPropertyOptional({ description: 'Searches name, SKU and barcode' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  search?: string;

  @ApiPropertyOptional({
    description:
      'A category id (its sub-categories are included), or "none" for products without a category',
    example: 'none',
  })
  @IsOptional()
  @ValidateIf((_o, v) => v !== 'none')
  @IsUUID('all', { message: 'categoryId must be a category id or "none"' })
  categoryId?: string;

  @ApiPropertyOptional({ enum: ['active', 'inactive', 'all'], default: 'active' })
  @IsOptional()
  @IsIn(['active', 'inactive', 'all'])
  status: ProductStatusFilter = 'active';

  @ApiPropertyOptional({ description: 'Only products below their minimum stock' })
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true' || value === '1')
  @IsBoolean()
  lowStock?: boolean;

  @ApiPropertyOptional({ enum: ['name', 'sku', 'salePrice', 'createdAt'], default: 'name' })
  @IsOptional()
  @IsIn(['name', 'sku', 'salePrice', 'createdAt'])
  sort: ProductSortField = 'name';

  @ApiPropertyOptional({ enum: ['asc', 'desc'], default: 'asc' })
  @IsOptional()
  @IsIn(['asc', 'desc'])
  order: 'asc' | 'desc' = 'asc';
}
