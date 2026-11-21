import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsBooleanString,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  MinLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { PaginationQueryDto } from '../../common/pagination';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);
/** Trims and turns "" into null so optional fields can be cleared. */
const clean = ({ value }: { value: unknown }) => {
  if (typeof value !== 'string') return value;
  const v = value.trim();
  return v === '' ? null : v;
};
const upper = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim().toUpperCase() : value;
const numToString = ({ value }: { value: unknown }) =>
  typeof value === 'number' ? String(value) : value;

/** Non-negative amount with up to 4 decimals; "," or "." accepted. */
const AMOUNT = /^\s*\d{1,14}([.,]\d{1,4})?\s*$/;
const AMOUNT_MSG = 'must be a positive amount with at most 4 decimals';

// ── Categories ───────────────────────────────────────────────────────────────

export class SaveCategoryDto {
  @ApiProperty({ example: 'Boissons' })
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  name: string;

  @ApiPropertyOptional({ description: 'Parent category; null for a top-level category' })
  @IsOptional()
  @Transform(clean)
  @ValidateIf((_, v) => v !== null)
  @IsUUID()
  parentId?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

// ── Units ────────────────────────────────────────────────────────────────────

export class SaveUnitDto {
  @ApiProperty({ example: 'CTN' })
  @Transform(upper)
  @Matches(/^[A-Z0-9]{1,10}$/, { message: 'code: 1–10 letters or digits' })
  code: string;

  @ApiProperty({ example: 'Carton' })
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(40)
  name: string;
}

// ── Products ─────────────────────────────────────────────────────────────────

export class PackagingDto {
  @ApiProperty()
  @IsUUID()
  unitId: string;

  @ApiProperty({ example: '24', description: 'Base units in one of this unit' })
  @Transform(numToString)
  @Matches(AMOUNT, { message: `factor ${AMOUNT_MSG}` })
  factor: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(clean)
  @ValidateIf((_, v) => v !== null)
  @Matches(/^[0-9A-Za-z-]{1,40}$/, { message: 'barcode: digits / letters only' })
  barcode?: string | null;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  forPurchase?: boolean;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  forSale?: boolean;

  @ApiPropertyOptional({
    example: '15.000',
    description: 'Sale price excl. VAT for one of this unit; null = base price × factor',
  })
  @IsOptional()
  @Transform(numToString)
  @ValidateIf((_, v) => v !== null && v !== '')
  @Matches(AMOUNT, { message: `salePrice ${AMOUNT_MSG}` })
  salePrice?: string | null;
}

export class SaveProductDto {
  @ApiPropertyOptional({ description: 'Leave empty for an automatic reference' })
  @IsOptional()
  @Transform(({ value }) => {
    const v = clean({ value });
    return typeof v === 'string' ? v.toUpperCase() : v;
  })
  @ValidateIf((_, v) => v !== null)
  @Matches(/^[A-Z0-9._/-]{1,40}$/, { message: 'sku: letters, digits and . _ / - only' })
  sku?: string | null;

  @ApiPropertyOptional({ example: '6191234567890' })
  @IsOptional()
  @Transform(clean)
  @ValidateIf((_, v) => v !== null)
  @Matches(/^[0-9A-Za-z-]{1,40}$/, { message: 'barcode: digits / letters only' })
  barcode?: string | null;

  @ApiProperty({ example: "Jus d'orange 1 L" })
  @Transform(trim)
  @IsString()
  @MinLength(2)
  @MaxLength(150)
  name: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(clean)
  @ValidateIf((_, v) => v !== null)
  @IsString()
  @MaxLength(2000)
  description?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(clean)
  @ValidateIf((_, v) => v !== null)
  @IsUUID()
  categoryId?: string | null;

  @ApiProperty()
  @IsUUID()
  baseUnitId: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(clean)
  @ValidateIf((_, v) => v !== null)
  @IsUUID()
  taxRateId?: string | null;

  @ApiProperty({ example: '1.250', description: 'Sale price excluding VAT (HT)' })
  @Transform(numToString)
  @Matches(AMOUNT, { message: `salePrice ${AMOUNT_MSG}` })
  salePrice: string;

  @ApiPropertyOptional({
    example: '0.900',
    description: 'Purchase price excluding VAT (needs inventory.cost.view)',
  })
  @IsOptional()
  @Transform(numToString)
  @Matches(AMOUNT, { message: `purchasePrice ${AMOUNT_MSG}` })
  purchasePrice?: string;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({ type: [PackagingDto] })
  @IsOptional()
  @IsArray()
  @ArrayUnique((p: PackagingDto) => p.unitId, {
    message: 'each packaging unit can be used only once',
  })
  @ValidateNested({ each: true })
  @Type(() => PackagingDto)
  packagings?: PackagingDto[];
}

export const PRODUCT_SORTS = ['name', 'sku', 'salePrice', 'updatedAt'] as const;

export class ProductsQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({
    description: 'Includes sub-categories. Use "none" for products without category',
  })
  @IsOptional()
  @IsString()
  categoryId?: string;

  @ApiPropertyOptional({ description: '"true" / "false"; omit for all' })
  @IsOptional()
  @IsBooleanString()
  active?: string;

  @ApiPropertyOptional({ enum: PRODUCT_SORTS, default: 'name' })
  @IsOptional()
  @IsIn(PRODUCT_SORTS)
  sort?: (typeof PRODUCT_SORTS)[number];

  @ApiPropertyOptional({ enum: ['asc', 'desc'], default: 'asc' })
  @IsOptional()
  @IsIn(['asc', 'desc'])
  order?: 'asc' | 'desc';
}

export class ImportProductsDto {
  @ApiProperty({ description: 'CSV content (; or , separator)' })
  @IsString()
  @MinLength(1)
  @MaxLength(5_000_000)
  csv: string;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  dryRun?: boolean;
}
