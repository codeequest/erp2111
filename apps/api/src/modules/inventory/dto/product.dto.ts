import { ApiPropertyOptional } from '@nestjs/swagger';
import { ProductCondition } from '@prisma/client';
import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class CreateProductDto {
  @IsString() @IsNotEmpty() @MaxLength(64)
  sku!: string;

  @IsOptional() @IsString() @MaxLength(64)
  barcode?: string;

  @IsString() @IsNotEmpty() @MaxLength(200)
  name!: string;

  @IsOptional() @IsString() @MaxLength(2000)
  description?: string;

  // --- scooter attributes ---
  @IsOptional() @IsString() @MaxLength(80)
  brand?: string;

  @IsOptional() @IsString() @MaxLength(80)
  model?: string;

  @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(2000)
  engineCc?: number;

  @IsOptional() @IsBoolean()
  isElectric?: boolean;

  @IsOptional() @IsString() @MaxLength(40)
  color?: string;

  @IsOptional() @Type(() => Number) @IsInt() @Min(1980) @Max(2100)
  modelYear?: number;

  @IsOptional() @IsEnum(ProductCondition)
  condition?: ProductCondition;

  @IsOptional() @IsString() @MaxLength(500)
  imageUrl?: string;

  @IsOptional() @IsUUID()
  categoryId?: string;

  @IsUUID()
  baseUnitId!: string;

  @IsOptional() @IsUUID()
  taxRateId?: string;

  @IsOptional() @Type(() => Number) @IsNumber({ maxDecimalPlaces: 4 }) @Min(0)
  salePrice?: number;

  @IsOptional() @Type(() => Number) @IsNumber({ maxDecimalPlaces: 4 }) @Min(0)
  salePriceTnd?: number;

  @IsOptional() @Type(() => Number) @IsNumber({ maxDecimalPlaces: 4 }) @Min(0)
  minStock?: number;
}

export class UpdateProductDto {
  @IsOptional() @IsString() @IsNotEmpty() @MaxLength(64)
  sku?: string;

  @IsOptional() @IsString() @MaxLength(64)
  barcode?: string | null;

  @IsOptional() @IsString() @IsNotEmpty() @MaxLength(200)
  name?: string;

  @IsOptional() @IsString() @MaxLength(2000)
  description?: string | null;

  @IsOptional() @IsString() @MaxLength(80)
  brand?: string | null;

  @IsOptional() @IsString() @MaxLength(80)
  model?: string | null;

  @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(2000)
  engineCc?: number | null;

  @IsOptional() @IsBoolean()
  isElectric?: boolean;

  @IsOptional() @IsString() @MaxLength(40)
  color?: string | null;

  @IsOptional() @Type(() => Number) @IsInt() @Min(1980) @Max(2100)
  modelYear?: number | null;

  @IsOptional() @IsEnum(ProductCondition)
  condition?: ProductCondition;

  @IsOptional() @IsString() @MaxLength(500)
  imageUrl?: string | null;

  @IsOptional() @IsUUID()
  categoryId?: string | null;

  @IsOptional() @IsUUID()
  taxRateId?: string | null;

  @IsOptional() @Type(() => Number) @IsNumber({ maxDecimalPlaces: 4 }) @Min(0)
  salePrice?: number;

  @IsOptional() @Type(() => Number) @IsNumber({ maxDecimalPlaces: 4 }) @Min(0)
  salePriceTnd?: number;

  @IsOptional() @Type(() => Number) @IsNumber({ maxDecimalPlaces: 4 }) @Min(0)
  minStock?: number;

  @IsOptional() @IsBoolean()
  isActive?: boolean;
}

export class ListProductsQuery {
  @ApiPropertyOptional() @IsOptional() @IsString()
  search?: string;

  @ApiPropertyOptional() @IsOptional() @IsUUID()
  categoryId?: string;

  @ApiPropertyOptional() @IsOptional() @IsString()
  brand?: string;

  @ApiPropertyOptional({ enum: ProductCondition }) @IsOptional() @IsEnum(ProductCondition)
  condition?: ProductCondition;

  @ApiPropertyOptional({ description: 'true | false | all (default: true)' })
  @IsOptional() @Transform(({ value }) => String(value))
  active?: 'true' | 'false' | 'all';

  @ApiPropertyOptional({ default: 1 }) @IsOptional() @Type(() => Number) @IsInt() @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ default: 20 }) @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100)
  pageSize?: number = 20;
}

export class CreateUnitDto {
  @IsString() @IsNotEmpty() @MaxLength(16)
  code!: string;

  @IsString() @IsNotEmpty() @MaxLength(64)
  name!: string;
}

export class CreateCategoryDto {
  @IsString() @IsNotEmpty() @MaxLength(100)
  name!: string;

  @IsOptional() @IsUUID()
  parentId?: string;
}

export class UpdateCategoryDto {
  @IsOptional() @IsString() @IsNotEmpty() @MaxLength(100)
  name?: string;

  @IsOptional() @IsUUID()
  parentId?: string | null;

  @IsOptional() @IsBoolean()
  isActive?: boolean;
}
