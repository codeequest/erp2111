import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsInt,
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

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);
const trimToNull = ({ value }: { value: unknown }) => {
  if (typeof value !== 'string') return value;
  const t = value.trim();
  return t === '' ? null : t;
};

/** -90.00 … 1000.00 */
const PERCENT = /^-?\d{1,4}(\.\d{1,2})?$/;
const PERCENT_MESSAGE = 'adjustPercent must be a number like 0, -10 or 15.5';

export class CreatePriceListDto {
  @ApiProperty({ example: 'Wholesale' })
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(60)
  name: string;

  @ApiPropertyOptional({ nullable: true })
  @Transform(trimToNull)
  @IsOptional()
  @IsString()
  @MaxLength(300)
  description?: string | null;

  @ApiProperty({
    example: '-10',
    description: 'Change applied to the sale price of products without a fixed price',
  })
  @Transform(({ value }) => (typeof value === 'number' ? String(value) : trim({ value })))
  @Matches(PERCENT, { message: PERCENT_MESSAGE })
  adjustPercent: string;
}

export class UpdatePriceListDto {
  @ApiPropertyOptional()
  @Transform(trim)
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(60)
  name?: string;

  @ApiPropertyOptional({ nullable: true })
  @Transform(trimToNull)
  @IsOptional()
  @IsString()
  @MaxLength(300)
  description?: string | null;

  @ApiPropertyOptional({ example: '-10' })
  @Transform(({ value }) => (typeof value === 'number' ? String(value) : trim({ value })))
  @IsOptional()
  @Matches(PERCENT, { message: PERCENT_MESSAGE })
  adjustPercent?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class PriceListProductsQueryDto {
  @ApiPropertyOptional()
  @Transform(trimToNull)
  @IsOptional()
  @IsString()
  @MaxLength(100)
  search?: string | null;

  @ApiPropertyOptional({ description: 'Only products with at least one fixed price' })
  @Transform(({ value }) => value === true || value === 'true' || value === '1')
  @IsOptional()
  @IsBoolean()
  onlyFixed?: boolean;

  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;

  @ApiPropertyOptional({ default: 25 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize: number = 25;
}

export class UnitPriceDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  unitId: string;

  @ApiProperty({ example: '11.50', nullable: true, description: 'null removes the fixed price' })
  @Transform(({ value }) =>
    value === '' ? null : typeof value === 'number' ? String(value) : value,
  )
  @ValidateIf((_, v) => v !== null)
  @Matches(/^\d{1,14}(\.\d{1,4})?$/, {
    message: 'price must be a non-negative number with at most 4 decimals',
  })
  price: string | null;
}

export class SetProductPricesDto {
  @ApiProperty({ type: [UnitPriceDto] })
  @IsArray()
  @ArrayMaxSize(21)
  @ValidateNested({ each: true })
  @Type(() => UnitPriceDto)
  prices: UnitPriceDto[];
}

export class LabelsQueryDto {
  @ApiProperty({ description: 'Comma-separated product ids (max 200)' })
  @Transform(({ value }) =>
    typeof value === 'string'
      ? value
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean)
      : value,
  )
  @IsArray()
  @ArrayMaxSize(200)
  @IsUUID('all', { each: true })
  ids: string[];

  @ApiPropertyOptional({ format: 'uuid', description: 'Print this price list’s prices' })
  @Transform(trimToNull)
  @IsOptional()
  @IsUUID()
  priceListId?: string | null;
}
