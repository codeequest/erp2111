import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsDate,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { STOCK_MOVE_TYPES, type StockFilter, type StockMoveType } from '@erp/shared';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

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
  @ApiPropertyOptional({ description: 'Matches SKU, barcode or name' })
  @Transform(trim)
  @IsOptional()
  @IsString()
  @MaxLength(100)
  search?: string;

  @ApiPropertyOptional({ format: 'uuid', description: 'Show only this warehouse' })
  @IsOptional()
  @IsUUID()
  warehouseId?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  categoryId?: string;

  @ApiPropertyOptional({ enum: ['all', 'inStock', 'low', 'out'], default: 'all' })
  @IsOptional()
  @IsIn(['all', 'inStock', 'low', 'out'])
  stock: StockFilter = 'all';
}

export class StockMovesQueryDto extends PageQuery {
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  productId?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  warehouseId?: string;

  @ApiPropertyOptional({ enum: STOCK_MOVE_TYPES })
  @IsOptional()
  @IsIn(STOCK_MOVE_TYPES)
  type?: StockMoveType;

  @ApiPropertyOptional({
    example: '2026-10-31T23:00:00.000Z',
    description: 'Instant, inclusive (the web app sends local midnight)',
  })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  from?: Date;

  @ApiPropertyOptional({
    example: '2026-11-30T23:00:00.000Z',
    description: 'Instant, exclusive (local midnight of the day after the last day)',
  })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  to?: Date;
}
