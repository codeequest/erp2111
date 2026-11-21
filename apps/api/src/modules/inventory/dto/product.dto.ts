import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);
const trimOrNull = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() || null : value;
/** Accepts 12, 12.5 or "12.5" and keeps it as a string (Decimal-safe). */
const decimalString = ({ value }: { value: unknown }) =>
  typeof value === 'number' ? String(value) : typeof value === 'string' ? value.trim() : value;

/** Non-negative, up to 14 integer digits and 4 decimals (DB: Decimal(18,4)). */
const DECIMAL_4 = /^\d{1,14}(\.\d{1,4})?$/;
const DECIMAL_MSG = 'must be a non-negative number with at most 4 decimals';

export class ProductUnitDto {
  @ApiProperty({ description: 'Unit id (must differ from the base unit)' })
  @IsUUID()
  unitId: string;

  @ApiProperty({ example: '24', description: 'Base units in one of this unit' })
  @Transform(decimalString)
  @IsString()
  @Matches(DECIMAL_4, { message: `factor ${DECIMAL_MSG}` })
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
  @Transform(trimOrNull)
  @IsString()
  @MaxLength(64)
  barcode?: string | null;
}

export class CreateProductDto {
  @ApiProperty({ example: 'BEV-COLA-33' })
  @Transform(trim)
  @IsString()
  @Length(1, 50)
  @Matches(/^[A-Za-z0-9._/-]+$/, {
    message: 'sku may only contain letters, digits, ".", "_", "/", "-"',
  })
  sku: string;

  @ApiPropertyOptional({ example: '5449000000996', nullable: true })
  @IsOptional()
  @Transform(trimOrNull)
  @IsString()
  @MaxLength(64)
  barcode?: string | null;

  @ApiProperty({ example: 'Cola 33cl can' })
  @Transform(trim)
  @IsString()
  @Length(1, 200)
  name: string;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @Transform(trimOrNull)
  @IsString()
  @MaxLength(2000)
  description?: string | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsUUID()
  categoryId?: string | null;

  @ApiProperty({ description: 'Stock is kept in this unit. Locked once stock has moved.' })
  @IsUUID()
  baseUnitId: string;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsUUID()
  taxRateId?: string | null;

  @ApiPropertyOptional({ example: '1.2500', description: 'Price per base unit, tax excluded' })
  @IsOptional()
  @Transform(decimalString)
  @IsString()
  @Matches(DECIMAL_4, { message: `salePrice ${DECIMAL_MSG}` })
  salePrice?: string;

  @ApiPropertyOptional({ example: '24', description: 'Low-stock alert threshold (base unit)' })
  @IsOptional()
  @Transform(decimalString)
  @IsString()
  @Matches(DECIMAL_4, { message: `minStock ${DECIMAL_MSG}` })
  minStock?: string;

  @ApiPropertyOptional({
    type: [ProductUnitDto],
    description: 'Extra purchase / sale units. On update, the list REPLACES the current one.',
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => ProductUnitDto)
  units?: ProductUnitDto[];
}

export class UpdateProductDto extends PartialType(CreateProductDto) {
  @ApiPropertyOptional({
    description: 'true = reactivate. Use POST /:id/deactivate to deactivate.',
  })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class ProductQueryDto {
  @ApiPropertyOptional({ description: 'Search in SKU, name and barcodes' })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(100)
  q?: string;

  @ApiPropertyOptional({ description: 'Includes products of its sub-categories' })
  @IsOptional()
  @IsUUID()
  categoryId?: string;

  @ApiPropertyOptional({ enum: ['active', 'inactive', 'all'], default: 'active' })
  @IsOptional()
  @IsIn(['active', 'inactive', 'all'])
  status?: 'active' | 'inactive' | 'all';

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
