import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsDateString,
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
import { StockMoveType } from '@prisma/client';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);
const decimalString = ({ value }: { value: unknown }) =>
  typeof value === 'number' ? String(value) : typeof value === 'string' ? value.trim() : value;
const toBool = ({ value }: { value: unknown }) =>
  value === true || value === 'true' || value === '1';

const QTY = /^\d{1,14}(\.\d{1,4})?$/;
const SIGNED_QTY = /^-?\d{1,14}(\.\d{1,4})?$/;

class PageQuery {
  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ default: 50, maximum: 200 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  pageSize?: number;
}

export class StockLevelsQueryDto extends PageQuery {
  @ApiPropertyOptional({ description: 'Search SKU or name' })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(100)
  q?: string;

  @ApiPropertyOptional({ description: 'Limit to one warehouse' })
  @IsOptional()
  @IsUUID()
  warehouseId?: string;

  @ApiPropertyOptional({ description: 'Limit to one product' })
  @IsOptional()
  @IsUUID()
  productId?: string;

  @ApiPropertyOptional({ description: 'Only products below their minimum stock' })
  @IsOptional()
  @Transform(toBool)
  @IsBoolean()
  lowOnly?: boolean;

  @ApiPropertyOptional({ description: 'Hide products with no stock and no minimum' })
  @IsOptional()
  @Transform(toBool)
  @IsBoolean()
  inStockOnly?: boolean;
}

export class StockMovesQueryDto extends PageQuery {
  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  productId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  warehouseId?: string;

  @ApiPropertyOptional({ enum: StockMoveType, isArray: true, description: 'Comma-separated' })
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.split(',').filter(Boolean) : value))
  @IsIn(Object.values(StockMoveType), { each: true })
  type?: StockMoveType[];

  @ApiPropertyOptional({ example: '2026-11-01' })
  @IsOptional()
  @IsDateString()
  from?: string;

  @ApiPropertyOptional({ example: '2026-11-30', description: 'Inclusive (whole day)' })
  @IsOptional()
  @IsDateString()
  to?: string;

  @ApiPropertyOptional({ description: 'Document number, e.g. ADJ-2026-00001' })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(50)
  reference?: string;
}

// ── Adjustment ──────────────────────────────────────────────────────────────

export class AdjustmentLineDto {
  @ApiProperty()
  @IsUUID()
  productId: string;

  @ApiProperty({
    example: '-3',
    description: 'mode "delta": signed change. mode "count": the quantity counted (≥ 0).',
  })
  @Transform(decimalString)
  @IsString()
  @Matches(SIGNED_QTY, { message: 'quantity must be a number with at most 4 decimals' })
  quantity: string;
}

export class CreateAdjustmentDto {
  @ApiProperty()
  @IsUUID()
  warehouseId: string;

  @ApiProperty({
    enum: ['count', 'delta'],
    description: 'count = set stock to the counted quantity; delta = add / remove',
  })
  @IsIn(['count', 'delta'])
  mode: 'count' | 'delta';

  @ApiProperty({ example: 'Monthly count', description: 'Required: why stock changes' })
  @Transform(trim)
  @IsString()
  @Length(3, 300)
  reason: string;

  @ApiProperty({ type: [AdjustmentLineDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(500)
  @ValidateNested({ each: true })
  @Type(() => AdjustmentLineDto)
  lines: AdjustmentLineDto[];
}

// ── Transfer ────────────────────────────────────────────────────────────────

export class TransferLineDto {
  @ApiProperty()
  @IsUUID()
  productId: string;

  @ApiProperty({ example: '12' })
  @Transform(decimalString)
  @IsString()
  @Matches(QTY, { message: 'quantity must be a positive number with at most 4 decimals' })
  quantity: string;
}

export class CreateTransferDto {
  @ApiProperty()
  @IsUUID()
  fromWarehouseId: string;

  @ApiProperty()
  @IsUUID()
  toWarehouseId: string;

  @ApiPropertyOptional({ example: 'Restock the shop' })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(300)
  note?: string;

  @ApiProperty({ type: [TransferLineDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(500)
  @ValidateNested({ each: true })
  @Type(() => TransferLineDto)
  lines: TransferLineDto[];
}

// ── Opening balance ─────────────────────────────────────────────────────────

export class OpeningLineDto {
  @ApiProperty()
  @IsUUID()
  productId: string;

  @ApiProperty({ example: '120' })
  @Transform(decimalString)
  @IsString()
  @Matches(QTY, { message: 'quantity must be a positive number with at most 4 decimals' })
  quantity: string;

  @ApiProperty({ example: '0.85', description: 'Cost per base unit' })
  @Transform(decimalString)
  @IsString()
  @Matches(QTY, { message: 'unitCost must be a non-negative number with at most 4 decimals' })
  unitCost: string;
}

export class CreateOpeningDto {
  @ApiProperty()
  @IsUUID()
  warehouseId: string;

  @ApiProperty({ type: [OpeningLineDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(2000)
  @ValidateNested({ each: true })
  @Type(() => OpeningLineDto)
  lines: OpeningLineDto[];
}
