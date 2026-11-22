import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { IMPORT_MODES, PRODUCT_TYPES, type ImportMode, type ProductType } from '@erp/shared';
import { DECIMAL_PATTERN } from '../product-rules';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);
/** "" → null, so the client can clear an optional field. */
const trimToNull = ({ value }: { value: unknown }) => {
  if (typeof value !== 'string') return value;
  const t = value.trim();
  return t === '' ? null : t;
};
const DECIMAL_MSG = '$property must be a positive number with up to 4 decimals, e.g. 12.5';

export class ProductUnitInput {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  unitId: string;

  @ApiProperty({ example: '24', description: 'Base units in one of this unit' })
  @IsString()
  @Matches(DECIMAL_PATTERN, { message: DECIMAL_MSG })
  factor: string;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  forPurchase?: boolean;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  forSale?: boolean;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @Transform(trimToNull)
  @IsString()
  @MaxLength(64)
  barcode?: string | null;
}

export class CreateProductDto {
  @ApiPropertyOptional({
    description: 'Leave empty to generate one (PRD-00001…)',
    example: 'TSH-001',
  })
  @IsOptional()
  @Transform(trimToNull)
  @IsString()
  @MaxLength(64)
  @Matches(/^[^\s].*$/, { message: 'sku cannot start with a space' })
  sku?: string | null;

  @ApiProperty({ example: 'T-shirt blue M' })
  @Transform(trim)
  @IsString()
  @MinLength(1, { message: 'name is required' })
  @MaxLength(200)
  name: string;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @Transform(trimToNull)
  @IsString()
  @MaxLength(64)
  barcode?: string | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @Transform(trimToNull)
  @IsString()
  @MaxLength(5000)
  description?: string | null;

  @ApiPropertyOptional({ enum: PRODUCT_TYPES, default: 'STOCKABLE' })
  @IsOptional()
  @IsIn(PRODUCT_TYPES)
  type?: ProductType;

  @ApiPropertyOptional({ format: 'uuid', nullable: true })
  @IsOptional()
  @Transform(trimToNull)
  @ValidateIf((_o, v) => v !== null)
  @IsUUID()
  categoryId?: string | null;

  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  baseUnitId: string;

  @ApiPropertyOptional({ format: 'uuid', nullable: true })
  @IsOptional()
  @Transform(trimToNull)
  @ValidateIf((_o, v) => v !== null)
  @IsUUID()
  taxRateId?: string | null;

  @ApiPropertyOptional({ example: '19.900' })
  @IsOptional()
  @IsString()
  @Matches(DECIMAL_PATTERN, { message: DECIMAL_MSG })
  salePrice?: string;

  @ApiPropertyOptional({ example: '12.500', description: 'Requires inventory.cost.view' })
  @IsOptional()
  @IsString()
  @Matches(DECIMAL_PATTERN, { message: DECIMAL_MSG })
  purchasePrice?: string;

  @ApiPropertyOptional({ example: '10' })
  @IsOptional()
  @IsString()
  @Matches(DECIMAL_PATTERN, { message: DECIMAL_MSG })
  minStock?: string;

  @ApiPropertyOptional({ type: [ProductUnitInput], description: 'Extra purchase / sale units' })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => ProductUnitInput)
  units?: ProductUnitInput[];
}

export class UpdateProductDto extends PartialType(CreateProductDto) {
  @ApiPropertyOptional({
    description:
      'updatedAt of the version you edited. If someone saved the product since, the API answers 409.',
  })
  @IsOptional()
  @IsISO8601()
  expectedUpdatedAt?: string;
}

export const PRODUCT_SORT_FIELDS = ['name', 'sku', 'salePrice', 'createdAt', 'updatedAt'] as const;

export class ProductQueryDto {
  @ApiPropertyOptional({ description: 'Searches name, SKU and barcode' })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(100)
  search?: string;

  @ApiPropertyOptional({ format: 'uuid', description: 'Includes sub-categories' })
  @IsOptional()
  @IsUUID()
  categoryId?: string;

  @ApiPropertyOptional({ enum: PRODUCT_TYPES })
  @IsOptional()
  @IsIn(PRODUCT_TYPES)
  type?: ProductType;

  @ApiPropertyOptional({ enum: ['active', 'inactive', 'all'], default: 'active' })
  @IsOptional()
  @IsIn(['active', 'inactive', 'all'])
  status?: 'active' | 'inactive' | 'all';

  @ApiPropertyOptional({
    enum: ['low', 'out'],
    description: 'Only low-stock or out-of-stock items',
  })
  @IsOptional()
  @IsIn(['low', 'out'])
  stock?: 'low' | 'out';

  @ApiPropertyOptional({ enum: PRODUCT_SORT_FIELDS, default: 'name' })
  @IsOptional()
  @IsIn(PRODUCT_SORT_FIELDS)
  sort?: (typeof PRODUCT_SORT_FIELDS)[number];

  @ApiPropertyOptional({ enum: ['asc', 'desc'], default: 'asc' })
  @IsOptional()
  @IsIn(['asc', 'desc'])
  dir?: 'asc' | 'desc';

  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ default: 25, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number;
}

export const BULK_ACTIONS = ['activate', 'deactivate', 'set-category'] as const;

export class BulkProductActionDto {
  @ApiProperty({ type: [String], format: 'uuid' })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(500)
  @IsUUID('all', { each: true })
  ids: string[];

  @ApiProperty({ enum: BULK_ACTIONS })
  @IsIn(BULK_ACTIONS)
  action: (typeof BULK_ACTIONS)[number];

  @ApiPropertyOptional({
    format: 'uuid',
    nullable: true,
    description: 'For set-category; null = no category',
  })
  @ValidateIf((o: BulkProductActionDto) => o.action === 'set-category' && o.categoryId !== null)
  @IsUUID()
  categoryId?: string | null;
}

export class ImportProductsDto {
  @ApiPropertyOptional({
    enum: IMPORT_MODES,
    default: 'create',
    description: 'create = new SKUs only, update = existing SKUs only, upsert = both',
  })
  @IsOptional()
  @IsIn(IMPORT_MODES)
  mode?: ImportMode;
}

export class CreateCategoryDto {
  @ApiProperty({ example: 'Phones' })
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name: string;

  @ApiPropertyOptional({ format: 'uuid', nullable: true })
  @IsOptional()
  @Transform(trimToNull)
  @ValidateIf((_o, v) => v !== null)
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
  @ApiProperty({ example: 'CTN', description: 'Short code, letters / digits / _' })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toUpperCase() : value,
  )
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
