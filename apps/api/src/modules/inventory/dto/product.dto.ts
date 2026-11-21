import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);
const emptyToNull = ({ value }: { value: unknown }) => {
  if (typeof value !== 'string') return value;
  const v = value.trim();
  return v === '' ? null : v;
};

export class ProductUnitDto {
  @ApiProperty({ description: 'Unit id (e.g. the id of CTN)' })
  @IsUUID()
  unitId: string;

  @ApiProperty({ example: 24, description: 'How many base units are in one of this unit' })
  @IsNumber({ maxDecimalPlaces: 4 })
  @IsPositive()
  factor: number;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  forPurchase?: boolean;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  forSale?: boolean;

  @ApiPropertyOptional({ example: '06111234567890' })
  @IsOptional()
  @Transform(emptyToNull)
  @IsString()
  @MaxLength(64)
  barcode?: string | null;
}

export class CreateProductDto {
  @ApiProperty({ example: 'COCA-33CL' })
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  @Matches(/^[A-Za-z0-9._\-/]+$/, {
    message: 'sku may only contain letters, digits and . _ - /',
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
  @MinLength(1)
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
  @IsUUID()
  categoryId?: string | null;

  @ApiProperty({ description: 'Stock is always kept in this unit' })
  @IsUUID()
  baseUnitId: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  taxRateId?: string | null;

  @ApiPropertyOptional({ example: 1.5, default: 0 })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0)
  salePrice?: number;

  @ApiPropertyOptional({
    example: 0.8,
    default: 0,
    description: 'Reference purchase price excl. VAT (needs inventory.cost.view)',
  })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0)
  purchasePrice?: number;

  @ApiPropertyOptional({ example: 48, default: 0, description: 'Low-stock alert threshold' })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0)
  minStock?: number;

  @ApiPropertyOptional({
    default: false,
    description:
      'Keep stock per lot (batch number + expiry date). Cannot change once stock has moved.',
  })
  @IsOptional()
  @IsBoolean()
  trackLots?: boolean;

  @ApiPropertyOptional({
    type: [ProductUnitDto],
    description: 'Alternative units (replaces the whole list on update)',
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => ProductUnitDto)
  units?: ProductUnitDto[];
}

export class UpdateProductDto extends PartialType(CreateProductDto) {}

export const PRODUCT_SORTS = [
  'name',
  '-name',
  'sku',
  '-sku',
  'salePrice',
  '-salePrice',
  '-createdAt',
] as const;
export type ProductSort = (typeof PRODUCT_SORTS)[number];

export class ListProductsQueryDto {
  @ApiPropertyOptional({ description: 'Search in SKU, name and barcodes' })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(100)
  q?: string;

  @ApiPropertyOptional({ description: 'Category id (includes sub-categories)' })
  @IsOptional()
  @IsUUID()
  categoryId?: string;

  @ApiPropertyOptional({ enum: ['active', 'inactive', 'all'], default: 'active' })
  @IsOptional()
  @IsIn(['active', 'inactive', 'all'])
  status?: 'active' | 'inactive' | 'all';

  @ApiPropertyOptional({ description: 'Only products at or below their minimum stock' })
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true' || value === '1')
  @IsBoolean()
  lowStock?: boolean;

  @ApiPropertyOptional({
    description: 'Only lot-tracked products with stock expiring within 30 days (or expired)',
  })
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true' || value === '1')
  @IsBoolean()
  expiring?: boolean;

  @ApiPropertyOptional({ description: 'Also return the price of each product in this price list' })
  @IsOptional()
  @IsUUID()
  priceListId?: string;

  @ApiPropertyOptional({ enum: PRODUCT_SORTS, default: 'name' })
  @IsOptional()
  @IsIn(PRODUCT_SORTS)
  sort?: ProductSort;

  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ default: 25, maximum: 500 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(500)
  pageSize?: number;
}

export class ImportProductsDto {
  @ApiProperty({
    description:
      'CSV text with a header row. Columns: sku, name, barcode, category, unit, sale_price, min_stock, description. Comma or semicolon separated.',
    example: 'sku;name;unit;sale_price\nCOCA-33CL;Coca-Cola 33cl;PCS;1.50',
  })
  @IsString()
  @MinLength(1)
  @MaxLength(5_000_000)
  csv: string;

  @ApiPropertyOptional({ default: false, description: 'Validate only, save nothing' })
  @IsOptional()
  @IsBoolean()
  dryRun?: boolean;
}

export class CreateCategoryDto {
  @ApiProperty({ example: 'Beverages' })
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name: string;

  @ApiPropertyOptional({ description: 'Parent category (empty = top level)' })
  @IsOptional()
  @IsUUID()
  parentId?: string | null;
}

export class UpdateCategoryDto extends PartialType(CreateCategoryDto) {
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class CreateUnitDto {
  @ApiProperty({ example: 'CTN' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toUpperCase() : value))
  @IsString()
  @Matches(/^[A-Z0-9_]{1,10}$/, { message: 'code must be 1–10 letters, digits or _' })
  code: string;

  @ApiProperty({ example: 'Carton' })
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(50)
  name: string;
}
