import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import {
  PRODUCT_SORT_FIELDS,
  PRODUCT_STATUS_FILTERS,
  type ProductSortField,
  type ProductStatusFilter,
} from '@erp/shared';

/** Non-negative decimal with up to 4 decimals, sent as a string: "12", "9.99", "0.1250". */
const DECIMAL = /^\d{1,14}(\.\d{1,4})?$/;
const DECIMAL_MESSAGE = '$property must be a non-negative number with at most 4 decimals';

/** Trims strings; turns "" into null so optional fields can be cleared. */
const trimToNull = ({ value }: { value: unknown }) => {
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
};
const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

export class CreateProductDto {
  @ApiProperty({ example: 'SKU-0001' })
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

  @ApiProperty({ example: 'Olive oil 1L' })
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

  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  baseUnitId: string;

  @ApiPropertyOptional({ format: 'uuid', nullable: true })
  @Transform(trimToNull)
  @IsOptional()
  @IsUUID()
  taxRateId?: string | null;

  @ApiProperty({ example: '12.50' })
  @Transform(trim)
  @Matches(DECIMAL, { message: DECIMAL_MESSAGE })
  salePrice: string;

  @ApiPropertyOptional({ example: '10' })
  @Transform(trim)
  @IsOptional()
  @Matches(DECIMAL, { message: DECIMAL_MESSAGE })
  minStock?: string;
}

export class UpdateProductDto extends PartialType(CreateProductDto) {}

export class ListProductsQueryDto {
  @ApiPropertyOptional({ description: 'Matches name, SKU or barcode' })
  @Transform(trimToNull)
  @IsOptional()
  @IsString()
  @MaxLength(100)
  search?: string | null;

  @ApiPropertyOptional({ format: 'uuid' })
  @Transform(trimToNull)
  @IsOptional()
  @IsUUID()
  categoryId?: string | null;

  @ApiPropertyOptional({ description: 'Only active products below their minimum stock' })
  @Transform(({ value }) => value === true || value === 'true' || value === '1')
  @IsOptional()
  @IsBoolean()
  lowStock?: boolean;

  @ApiPropertyOptional({
    enum: ['with', 'without'],
    description: 'Only products that have (with) or have no (without) barcode',
  })
  @Transform(trimToNull)
  @IsOptional()
  @IsIn(['with', 'without'])
  barcode?: 'with' | 'without' | null;

  @ApiPropertyOptional({
    description: 'Only these barcodes (separated by commas, semicolons, spaces or new lines)',
  })
  @Transform(trimToNull)
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  barcodes?: string | null;

  @ApiPropertyOptional({ enum: PRODUCT_STATUS_FILTERS, default: 'active' })
  @IsOptional()
  @IsIn(PRODUCT_STATUS_FILTERS)
  status: ProductStatusFilter = 'active';

  @ApiPropertyOptional({ enum: PRODUCT_SORT_FIELDS, default: 'name' })
  @IsOptional()
  @IsIn(PRODUCT_SORT_FIELDS)
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

/** The list filters, plus the file format of the export. */
export class ExportProductsQueryDto extends ListProductsQueryDto {
  @ApiPropertyOptional({ enum: ['csv', 'xlsx'], default: 'csv' })
  @IsOptional()
  @IsIn(['csv', 'xlsx'])
  format: 'csv' | 'xlsx' = 'csv';
}
