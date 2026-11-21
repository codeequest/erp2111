import { ApiProperty, ApiPropertyOptional, PartialType, OmitType } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator';

/** Money / quantity sent as a string to keep Decimal precision, e.g. "12.5000". */
const DECIMAL = /^\d{1,14}(\.\d{1,4})?$/;
const DECIMAL_MSG = 'must be a positive number with at most 4 decimals';

/** Empty strings from HTML forms become null. */
const emptyToNull = () =>
  Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' && value.trim() === '' ? null : value,
  );

export class VariantOptionDto {
  @ApiProperty({ example: 'Size' })
  @IsString()
  @MinLength(1)
  @MaxLength(40)
  name: string;

  @ApiProperty({ example: ['S', 'M', 'L'] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @IsString({ each: true })
  @MaxLength(40, { each: true })
  values: string[];
}

export class CreateProductDto {
  @ApiProperty({ example: 'TSHIRT' })
  @IsString()
  @MinLength(1)
  @MaxLength(50)
  @Matches(/^[A-Za-z0-9._-]+$/, { message: 'sku may only contain letters, digits, . _ and -' })
  sku: string;

  @ApiPropertyOptional({ example: '5449000000996' })
  @IsOptional()
  @emptyToNull()
  @IsString()
  @MaxLength(50)
  barcode?: string | null;

  @ApiProperty({ example: 'Cotton T-shirt' })
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name: string;

  @ApiPropertyOptional()
  @IsOptional()
  @emptyToNull()
  @IsString()
  @MaxLength(2000)
  description?: string | null;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @emptyToNull()
  @IsUUID()
  categoryId?: string | null;

  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  baseUnitId: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @emptyToNull()
  @IsUUID()
  taxRateId?: string | null;

  @ApiProperty({ example: '19.9000', description: 'Default sale price per base unit' })
  @Matches(DECIMAL, { message: `salePrice ${DECIMAL_MSG}` })
  salePrice: string;

  @ApiPropertyOptional({ example: '10', description: 'Low-stock threshold (base unit)' })
  @IsOptional()
  @Matches(DECIMAL, { message: `minStock ${DECIMAL_MSG}` })
  minStock?: string;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  hasVariants?: boolean;

  @ApiPropertyOptional({
    type: [VariantOptionDto],
    description: 'Required when hasVariants is true. One variant is created per combination.',
  })
  @ValidateIf((o: CreateProductDto) => o.hasVariants === true)
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => VariantOptionDto)
  variantOptions?: VariantOptionDto[];

  @ApiPropertyOptional({
    type: () => [PriceInputDto],
    description: 'Prices per price list (copied to every variant)',
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PriceInputDto)
  prices?: PriceInputDto[];
}

export class UpdateProductDto extends PartialType(
  OmitType(CreateProductDto, ['hasVariants', 'variantOptions', 'prices'] as const),
) {}

export class GenerateVariantsDto {
  @ApiProperty({ type: [VariantOptionDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => VariantOptionDto)
  variantOptions: VariantOptionDto[];
}

export class PriceInputDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  priceListId: string;

  @ApiProperty({ example: '17.5000', nullable: true, description: 'null removes the price' })
  @ValidateIf((o: PriceInputDto) => o.price !== null)
  @Matches(DECIMAL, { message: `price ${DECIMAL_MSG}` })
  price: string | null;
}

export class SetPricesDto {
  @ApiProperty({ type: [PriceInputDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PriceInputDto)
  prices: PriceInputDto[];

  @ApiPropertyOptional({
    default: false,
    description: 'On a parent product: also apply the prices to every variant',
  })
  @IsOptional()
  @IsBoolean()
  applyToVariants?: boolean;
}

export const PRODUCT_SORT_FIELDS = ['name', 'sku', 'salePrice', 'createdAt'] as const;

export class ListProductsQueryDto {
  @ApiPropertyOptional({ description: 'Search in name, SKU and barcode' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  q?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  categoryId?: string;

  @ApiPropertyOptional({ enum: ['active', 'inactive', 'all'], default: 'active' })
  @IsOptional()
  @IsIn(['active', 'inactive', 'all'])
  status?: 'active' | 'inactive' | 'all';

  @ApiPropertyOptional({ description: 'Only products under their minimum stock' })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) => value === true || value === 'true')
  @IsBoolean()
  lowStock?: boolean;

  @ApiPropertyOptional({ enum: PRODUCT_SORT_FIELDS, default: 'name' })
  @IsOptional()
  @IsIn(PRODUCT_SORT_FIELDS)
  sort?: (typeof PRODUCT_SORT_FIELDS)[number];

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

  @ApiPropertyOptional({ default: 25, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  pageSize?: number;
}

export class ProductStatsQueryDto {
  @ApiPropertyOptional({ default: 30, description: 'Period in days' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  days?: number;
}

export class CreateCategoryDto {
  @ApiProperty({ example: 'Clothing' })
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @emptyToNull()
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
  @IsString()
  @Matches(/^[A-Z0-9]{1,10}$/, { message: 'code must be 1-10 uppercase letters or digits' })
  code: string;

  @ApiProperty({ example: 'Carton' })
  @IsString()
  @MinLength(1)
  @MaxLength(50)
  name: string;
}
