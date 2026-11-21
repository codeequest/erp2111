import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsInt,
  IsNumber,
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

export class CreatePriceListDto {
  @ApiProperty({ example: 'WHOLESALE' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toUpperCase() : value))
  @IsString()
  @Matches(/^[A-Z0-9_-]{1,20}$/, { message: 'code must be 1–20 letters, digits, _ or -' })
  code: string;

  @ApiProperty({ example: 'Wholesale' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MinLength(1)
  @MaxLength(60)
  name: string;

  @ApiPropertyOptional({
    example: -10,
    default: 0,
    description: 'Default rule vs the retail price, in %: -10 = 10 % cheaper, 5 = 5 % dearer',
  })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(-100)
  @Max(500)
  adjustmentPct?: number;
}

export class UpdatePriceListDto extends PartialType(CreatePriceListDto) {
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class ProductPriceDto {
  @ApiProperty()
  @IsUUID()
  priceListId: string;

  @ApiProperty({
    nullable: true,
    example: 1.35,
    description: 'Fixed price in this list; null = use the list rule',
  })
  @ValidateIf((_, v) => v !== null)
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0)
  price: number | null;
}

export class SetProductPricesDto {
  @ApiProperty({ type: [ProductPriceDto] })
  @IsArray()
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => ProductPriceDto)
  prices: ProductPriceDto[];
}

export class ListPriceItemsQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MaxLength(100)
  q?: string;

  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ default: 50, maximum: 500 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(500)
  pageSize?: number;
}

export class ImportPricesDto {
  @ApiProperty({
    description: 'CSV: sku, price (empty price = remove the fixed price, back to the rule)',
    example: 'sku;price\nCOCA-33CL;1,35',
  })
  @IsString()
  @MinLength(1)
  @MaxLength(5_000_000)
  csv: string;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  dryRun?: boolean;
}
