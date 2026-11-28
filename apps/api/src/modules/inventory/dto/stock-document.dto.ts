import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
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
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import {
  MAX_COUNT_LINES_PER_SAVE,
  MAX_STOCK_DOCUMENT_LINES,
  STOCK_DOCUMENT_STATUSES,
  type StockDocumentStatus,
} from '@erp/shared';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);
const trimToNull = ({ value }: { value: unknown }) => {
  if (typeof value !== 'string') return value;
  const t = value.trim();
  return t === '' ? null : t;
};
/** Accepts numbers too, and a decimal comma ("3,5"). */
const decimalText = ({ value }: { value: unknown }) => {
  if (typeof value === 'number') return String(value);
  if (typeof value !== 'string') return value;
  const t = value.trim().replace(',', '.');
  return t === '' ? null : t;
};

export class ListStockDocumentsQueryDto {
  @ApiPropertyOptional({ enum: STOCK_DOCUMENT_STATUSES })
  @IsOptional()
  @IsIn(STOCK_DOCUMENT_STATUSES)
  status?: StockDocumentStatus;

  @ApiPropertyOptional({ format: 'uuid', description: 'Only documents touching this warehouse' })
  @Transform(trimToNull)
  @IsOptional()
  @IsUUID()
  warehouseId?: string | null;

  @ApiPropertyOptional({ description: 'Matches the document number' })
  @Transform(trimToNull)
  @IsOptional()
  @IsString()
  @MaxLength(50)
  search?: string | null;

  @ApiPropertyOptional({ default: 1, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;

  @ApiPropertyOptional({ default: 25, minimum: 1, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize: number = 25;
}

// ── Adjustments ─────────────────────────────────────────────────────────────

export class AdjustmentLineDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  productId: string;

  @ApiProperty({ example: '-2', description: 'Base unit: + adds stock, - removes it (not zero)' })
  @Transform(decimalText)
  @Matches(/^-?\d{1,14}(\.\d{1,4})?$/, {
    message: 'quantity must be a number with at most 4 decimals',
  })
  quantity: string;

  @ApiPropertyOptional({
    example: '7.25',
    nullable: true,
    description: 'Cost of added stock (needs inventory.cost.view). Empty = average cost',
  })
  @Transform(decimalText)
  @IsOptional()
  @Matches(/^\d{1,14}(\.\d{1,4})?$/, {
    message: 'unitCost must be zero or more, with at most 4 decimals',
  })
  unitCost?: string | null;

  @ApiPropertyOptional({ nullable: true })
  @Transform(trimToNull)
  @IsOptional()
  @IsString()
  @MaxLength(200)
  notes?: string | null;
}

export class AdjustmentDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  warehouseId: string;

  @ApiProperty({ example: 'Broken during handling' })
  @Transform(trim)
  @IsString()
  @MinLength(1, { message: 'reason is required' })
  @MaxLength(200)
  reason: string;

  @ApiPropertyOptional({ nullable: true })
  @Transform(trimToNull)
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string | null;

  @ApiProperty({ type: [AdjustmentLineDto] })
  @IsArray()
  @ArrayMinSize(1, { message: 'add at least one product' })
  @ArrayMaxSize(MAX_STOCK_DOCUMENT_LINES)
  @ValidateNested({ each: true })
  @Type(() => AdjustmentLineDto)
  lines: AdjustmentLineDto[];
}

// ── Transfers ───────────────────────────────────────────────────────────────

export class TransferLineDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  productId: string;

  @ApiProperty({ example: '12', description: 'Positive quantity in base unit' })
  @Transform(decimalText)
  @Matches(/^\d{1,14}(\.\d{1,4})?$/, {
    message: 'quantity must be a positive number with at most 4 decimals',
  })
  quantity: string;
}

export class TransferDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  fromWarehouseId: string;

  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  toWarehouseId: string;

  @ApiPropertyOptional({ nullable: true })
  @Transform(trimToNull)
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string | null;

  @ApiProperty({ type: [TransferLineDto] })
  @IsArray()
  @ArrayMinSize(1, { message: 'add at least one product' })
  @ArrayMaxSize(MAX_STOCK_DOCUMENT_LINES)
  @ValidateNested({ each: true })
  @Type(() => TransferLineDto)
  lines: TransferLineDto[];
}

// ── Stock counts ────────────────────────────────────────────────────────────

export class CreateStockCountDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  warehouseId: string;

  @ApiPropertyOptional({ format: 'uuid', nullable: true, description: 'Count only this category (and sub-categories)' })
  @Transform(trimToNull)
  @IsOptional()
  @IsUUID()
  categoryId?: string | null;

  @ApiPropertyOptional({
    default: false,
    description: 'Also list active products with no stock here, so found goods can be counted',
  })
  @Transform(({ value }) => value === true || value === 'true' || value === '1')
  @IsOptional()
  @IsBoolean()
  includeZero: boolean = false;

  @ApiPropertyOptional({ nullable: true })
  @Transform(trimToNull)
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string | null;
}

export class CountLineDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  productId: string;

  @ApiProperty({ example: '12', nullable: true, description: 'Counted quantity (base unit). null = not counted' })
  @Transform(decimalText)
  @IsOptional()
  @Matches(/^\d{1,14}(\.\d{1,4})?$/, {
    message: 'countedQty must be zero or more, with at most 4 decimals',
  })
  countedQty: string | null;
}

export class SaveCountLinesDto {
  @ApiProperty({ type: [CountLineDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(MAX_COUNT_LINES_PER_SAVE)
  @ValidateNested({ each: true })
  @Type(() => CountLineDto)
  lines: CountLineDto[];
}
