import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import {
  STOCK_LEVEL_SORTS,
  STOCK_MOVE_TYPES,
  type StockLevelSort,
  type StockMoveTypeCode,
} from '@erp/shared';

const trimToNull = ({ value }: { value: unknown }) => {
  if (typeof value !== 'string') return value;
  const t = value.trim();
  return t === '' ? null : t;
};
const bool = ({ value }: { value: unknown }) => value === true || value === 'true' || value === '1';

class PageQuery {
  @ApiPropertyOptional({ default: 1, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;

  @ApiPropertyOptional({ default: 50, minimum: 1, maximum: 200 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  pageSize: number = 50;
}

export class StockLevelsQueryDto extends PageQuery {
  @ApiPropertyOptional({ description: 'Matches product name or SKU, or the exact barcode' })
  @Transform(trimToNull)
  @IsOptional()
  @IsString()
  @MaxLength(100)
  search?: string | null;

  @ApiPropertyOptional({ format: 'uuid', description: 'Quantities in this warehouse only' })
  @Transform(trimToNull)
  @IsOptional()
  @IsUUID()
  warehouseId?: string | null;

  @ApiPropertyOptional({ format: 'uuid', description: 'Includes sub-categories' })
  @Transform(trimToNull)
  @IsOptional()
  @IsUUID()
  categoryId?: string | null;

  @ApiPropertyOptional({ description: 'Only products with stock (on hand not zero)' })
  @Transform(bool)
  @IsOptional()
  @IsBoolean()
  inStock: boolean = false;

  @ApiPropertyOptional({ description: 'Only products below their minimum stock' })
  @Transform(bool)
  @IsOptional()
  @IsBoolean()
  lowStock: boolean = false;

  @ApiPropertyOptional({ enum: STOCK_LEVEL_SORTS, default: 'name' })
  @IsOptional()
  @IsIn(STOCK_LEVEL_SORTS)
  sort: StockLevelSort = 'name';

  @ApiPropertyOptional({ enum: ['asc', 'desc'], default: 'asc' })
  @IsOptional()
  @IsIn(['asc', 'desc'])
  order: 'asc' | 'desc' = 'asc';
}

export class StockMovesQueryDto extends PageQuery {
  @ApiPropertyOptional({ format: 'uuid' })
  @Transform(trimToNull)
  @IsOptional()
  @IsUUID()
  productId?: string | null;

  @ApiPropertyOptional({ format: 'uuid' })
  @Transform(trimToNull)
  @IsOptional()
  @IsUUID()
  warehouseId?: string | null;

  @ApiPropertyOptional({ enum: STOCK_MOVE_TYPES })
  @Transform(trimToNull)
  @IsOptional()
  @IsIn(STOCK_MOVE_TYPES)
  type?: StockMoveTypeCode | null;

  @ApiPropertyOptional({
    example: '2026-10-31T21:00:00.000Z',
    description: 'From this moment (included). The web app sends local midnight.',
  })
  @Transform(trimToNull)
  @IsOptional()
  @IsISO8601({ strict: true })
  from?: string | null;

  @ApiPropertyOptional({
    example: '2026-11-30T21:00:00.000Z',
    description: 'Before this moment (excluded): send the midnight after the last day',
  })
  @Transform(trimToNull)
  @IsOptional()
  @IsISO8601({ strict: true })
  to?: string | null;

  @ApiPropertyOptional({ description: 'Matches the document reference, e.g. ADJ-2026' })
  @Transform(trimToNull)
  @IsOptional()
  @IsString()
  @MaxLength(50)
  search?: string | null;
}
