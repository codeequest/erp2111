import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { StockMoveType } from '@prisma/client';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  Min,
  MinLength,
  Max,
  ValidateNested,
} from 'class-validator';

export class OpeningLineDto {
  @ApiProperty()
  @IsUUID()
  productId: string;

  @ApiProperty()
  @IsUUID()
  warehouseId: string;

  @ApiProperty({ example: 120, description: 'Quantity in the base unit' })
  @IsNumber({ maxDecimalPlaces: 4 })
  @IsPositive()
  quantity: number;

  @ApiProperty({ example: 0.8, description: 'Purchase cost per base unit' })
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0)
  unitCost: number;

  @ApiPropertyOptional({ example: 'L2026-118', description: 'Required for lot-tracked products' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  lotNumber?: string;

  @ApiPropertyOptional({
    example: '2027-06-30',
    description: 'Expiry date of the lot (YYYY-MM-DD)',
  })
  @IsOptional()
  @IsDateString({ strict: true })
  expiryDate?: string;
}

export class OpeningBalancesDto {
  @ApiPropertyOptional({
    description:
      'CSV with a header row: sku, warehouse (code, default MAIN), quantity, unit_cost. Use either csv or lines.',
    example: 'sku;warehouse;quantity;unit_cost\nCOCA-33CL;MAIN;240;0,80',
  })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(5_000_000)
  csv?: string;

  @ApiPropertyOptional({ type: [OpeningLineDto] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(5000)
  @ValidateNested({ each: true })
  @Type(() => OpeningLineDto)
  lines?: OpeningLineDto[];

  @ApiPropertyOptional({ default: false, description: 'Validate only, save nothing' })
  @IsOptional()
  @IsBoolean()
  dryRun?: boolean;
}

export class ProductImageDto {
  @ApiProperty({
    description: 'Image as a data URL (JPEG, PNG or WebP), max ~1.5 MB',
    example: 'data:image/jpeg;base64,/9j/4AAQ...',
  })
  @IsString()
  @Matches(/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/, {
    message: 'image must be a base64 data URL of a JPEG, PNG or WebP image',
  })
  @MaxLength(2_100_000)
  dataUrl: string;
}

export class ListMovesQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  productId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  warehouseId?: string;

  @ApiPropertyOptional({ enum: StockMoveType })
  @IsOptional()
  @IsIn(Object.values(StockMoveType))
  type?: StockMoveType;

  @ApiPropertyOptional({ example: '2026-01-01', description: 'From this day (inclusive)' })
  @IsOptional()
  @IsDateString({ strict: true })
  from?: string;

  @ApiPropertyOptional({ example: '2026-12-31', description: 'Up to this day (inclusive)' })
  @IsOptional()
  @IsDateString({ strict: true })
  to?: string;

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
