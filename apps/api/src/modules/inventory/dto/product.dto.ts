import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUrl,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);
/** Empty strings from HTML forms mean "no value". */
const trimOrNull = ({ value }: { value: unknown }) => {
  if (typeof value !== 'string') return value;
  const t = value.trim();
  return t === '' ? null : t;
};

const MONEY = { maxDecimalPlaces: 4 } as const;

export class CreateProductDto {
  @ApiProperty({ example: 'Olive oil 1L' })
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name: string;

  @ApiProperty({ example: 'OIL-1L', description: 'Unique stock-keeping unit' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toUpperCase() : value))
  @IsString()
  @Matches(/^[A-Z0-9][A-Z0-9._\-/]{0,63}$/, {
    message: 'sku may contain letters, digits, ".", "_", "-" and "/" (max 64 characters)',
  })
  sku: string;

  @ApiPropertyOptional({ example: '6191234567890', nullable: true })
  @Transform(trimOrNull)
  @IsOptional()
  @IsString()
  @Matches(/^[0-9A-Za-z\-]{4,64}$/, { message: 'barcode must be 4–64 letters or digits' })
  barcode?: string | null;

  @ApiPropertyOptional({ nullable: true })
  @Transform(trimOrNull)
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  description?: string | null;

  @ApiPropertyOptional({
    nullable: true,
    description: 'External image URL. To upload a file use POST /inventory/products/:id/image',
  })
  @Transform(trimOrNull)
  @IsOptional()
  @IsUrl({ protocols: ['http', 'https'], require_protocol: true, require_tld: false })
  @MaxLength(2000)
  imageUrl?: string | null;

  @ApiPropertyOptional({ format: 'uuid', nullable: true })
  @Transform(trimOrNull)
  @IsOptional()
  @IsUUID()
  categoryId?: string | null;

  @ApiPropertyOptional({ format: 'uuid', description: 'Defaults to the PCS unit' })
  @IsOptional()
  @IsUUID()
  baseUnitId?: string;

  @ApiPropertyOptional({ format: 'uuid', nullable: true, description: 'VAT rate' })
  @Transform(trimOrNull)
  @IsOptional()
  @IsUUID()
  taxRateId?: string | null;

  @ApiPropertyOptional({
    example: 7.5,
    description: 'Purchase price excl. VAT (needs inventory.cost.view)',
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber(MONEY)
  @Min(0)
  @Max(1e12)
  purchasePrice?: number;

  @ApiPropertyOptional({ example: 9.9, description: 'Selling price excl. VAT' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber(MONEY)
  @Min(0)
  @Max(1e12)
  salePrice?: number;

  @ApiPropertyOptional({ example: 10, description: 'Low-stock alert threshold (base unit)' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber(MONEY)
  @Min(0)
  @Max(1e12)
  minStock?: number;

  @ApiPropertyOptional({
    example: 50,
    description: 'Opening stock written as an OPENING stock move (needs inventory.stock.adjust)',
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber(MONEY)
  @Min(0)
  @Max(1e12)
  initialStock?: number;

  @ApiPropertyOptional({ format: 'uuid', description: 'Warehouse of the opening stock' })
  @IsOptional()
  @IsUUID()
  warehouseId?: string;
}

/** Same fields as create, all optional. Opening stock can only be set on create. */
export class UpdateProductDto extends PartialType(CreateProductDto) {}

export const PRODUCT_SORTS = ['name', 'sku', 'salePrice', 'onHand', 'updatedAt'] as const;
export type ProductSort = (typeof PRODUCT_SORTS)[number];

export class ListProductsQueryDto {
  @ApiPropertyOptional({ description: 'Searches name, SKU, barcode and description' })
  @Transform(trim)
  @IsOptional()
  @IsString()
  @MaxLength(100)
  search?: string;

  @ApiPropertyOptional({ format: 'uuid', description: 'Includes products of its subcategories' })
  @IsOptional()
  @IsUUID()
  categoryId?: string;

  @ApiPropertyOptional({ enum: ['active', 'inactive', 'all'], default: 'active' })
  @IsOptional()
  @IsIn(['active', 'inactive', 'all'])
  status?: 'active' | 'inactive' | 'all';

  @ApiPropertyOptional({ enum: ['all', 'low', 'out'], default: 'all' })
  @IsOptional()
  @IsIn(['all', 'low', 'out'])
  stock?: 'all' | 'low' | 'out';

  @ApiPropertyOptional({ enum: PRODUCT_SORTS, default: 'name' })
  @IsOptional()
  @IsIn(PRODUCT_SORTS)
  sort?: ProductSort;

  @ApiPropertyOptional({ enum: ['asc', 'desc'], default: 'asc' })
  @IsOptional()
  @IsIn(['asc', 'desc'])
  order?: 'asc' | 'desc';

  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ default: 25 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number;
}

export class CreateCategoryDto {
  @ApiProperty({ example: 'Beverages' })
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name: string;

  @ApiPropertyOptional({ format: 'uuid', nullable: true, description: 'Parent for a subcategory' })
  @Transform(trimOrNull)
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
  @Matches(/^[A-Z0-9]{1,10}$/, { message: 'code must be 1–10 letters or digits' })
  code: string;

  @ApiProperty({ example: 'Carton' })
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(50)
  name: string;
}
