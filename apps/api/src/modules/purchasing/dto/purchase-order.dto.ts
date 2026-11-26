import { ApiProperty, ApiPropertyOptional, OmitType, PartialType } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsDateString,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { PURCHASE_ORDER_STATUSES, type PurchaseOrderStatusFilter } from '@erp/shared';

/** Non-negative decimal with up to 4 decimals, sent as a string: "12", "9.99", "0.1250". */
const DECIMAL = /^\d{1,14}(\.\d{1,4})?$/;
const DECIMAL_MESSAGE = '$property must be a non-negative number with at most 4 decimals';
/** 0 to 100 with up to 2 decimals. */
const PERCENT = /^(100(\.0{1,2})?|\d{1,2}(\.\d{1,2})?)$/;

const trimToNull = ({ value }: { value: unknown }) => {
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
};
const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

export class PurchaseOrderLineDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  productId: string;

  @ApiProperty({ format: 'uuid', description: "The product's base unit or a purchase pack unit" })
  @IsUUID()
  unitId: string;

  @ApiProperty({ example: '12' })
  @Transform(trim)
  @Matches(DECIMAL, { message: DECIMAL_MESSAGE })
  quantity: string;

  @ApiProperty({ example: '2.75', description: 'Price of one line unit, before tax' })
  @Transform(trim)
  @Matches(DECIMAL, { message: DECIMAL_MESSAGE })
  unitPrice: string;

  @ApiPropertyOptional({ example: '5', default: '0' })
  @Transform(trim)
  @IsOptional()
  @Matches(PERCENT, { message: 'discountPct must be between 0 and 100 (max 2 decimals)' })
  discountPct?: string;
}

export class CreatePurchaseOrderDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  supplierId: string;

  @ApiProperty({ format: 'uuid', description: 'Where the goods will be received' })
  @IsUUID()
  warehouseId: string;

  @ApiPropertyOptional({ example: '2026-11-26' })
  @IsOptional()
  @IsDateString({ strict: true })
  orderDate?: string;

  @ApiPropertyOptional({ example: '2026-12-03', nullable: true })
  @Transform(trimToNull)
  @IsOptional()
  @IsDateString({ strict: true })
  expectedDate?: string | null;

  @ApiPropertyOptional()
  @Transform(trimToNull)
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string | null;

  @ApiPropertyOptional({
    type: [PurchaseOrderLineDto],
    description: 'Replaces every line of the order',
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(500)
  @ValidateNested({ each: true })
  @Type(() => PurchaseOrderLineDto)
  lines?: PurchaseOrderLineDto[];
}

export class UpdatePurchaseOrderDto extends PartialType(CreatePurchaseOrderDto) {}

const STATUS_FILTERS = [...PURCHASE_ORDER_STATUSES, 'open', 'all'] as const;

export class ListPurchaseOrdersQueryDto {
  @ApiPropertyOptional({ description: 'Matches the order number or the supplier code / name' })
  @Transform(trimToNull)
  @IsOptional()
  @IsString()
  @MaxLength(100)
  search?: string | null;

  @ApiPropertyOptional({
    enum: STATUS_FILTERS,
    default: 'all',
    description: 'open = confirmed or partially received',
  })
  @IsOptional()
  @IsIn(STATUS_FILTERS)
  status: PurchaseOrderStatusFilter = 'all';

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  supplierId?: string;

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

export type ExportLang = 'en' | 'fr';

export class ExportPurchaseOrdersQueryDto extends OmitType(ListPurchaseOrdersQueryDto, [
  'page',
  'pageSize',
] as const) {
  @ApiPropertyOptional({
    enum: ['en', 'fr'],
    default: 'en',
    description: 'Language of the headers',
  })
  @IsOptional()
  @IsIn(['en', 'fr'])
  lang: ExportLang = 'en';
}
