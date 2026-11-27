import { ApiProperty, ApiPropertyOptional, OmitType } from '@nestjs/swagger';
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
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import {
  DELIVERY_STATUSES,
  GOODS_RECEIPT_STATUSES,
  type DeliveryStatusFilter,
  type GoodsReceiptStatusFilter,
} from '@erp/shared';
import type { ExportLang } from './purchase-order.dto';

/** Non-negative decimal with up to 4 decimals, sent as a string. */
const DECIMAL = /^\d{1,14}(\.\d{1,4})?$/;

const trimToNull = ({ value }: { value: unknown }) => {
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
};
const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

export class GoodsReceiptLineDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  purchaseOrderLineId: string;

  @ApiProperty({ example: '12', description: "In the order line's unit; 0 = not received now" })
  @Transform(trim)
  @Matches(DECIMAL, {
    message: 'quantity must be a non-negative number with at most 4 decimals',
  })
  quantity: string;

  @ApiPropertyOptional({
    example: '2',
    description: 'Refused at the door (damaged, wrong item…): does not enter the stock',
  })
  @Transform(trim)
  @IsOptional()
  @Matches(DECIMAL, {
    message: 'rejected quantity must be a non-negative number with at most 4 decimals',
  })
  rejectedQty?: string;

  @ApiPropertyOptional({ example: 'Damaged packaging' })
  @Transform(trimToNull)
  @IsOptional()
  @IsString()
  @MaxLength(200)
  rejectReason?: string | null;
}

export class CreateGoodsReceiptDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  purchaseOrderId: string;

  @ApiPropertyOptional({
    example: '2026-11-26',
    description: 'Day the goods arrived; today by default',
  })
  @IsOptional()
  @IsDateString({ strict: true })
  receivedDate?: string;

  @ApiPropertyOptional({ example: 'BL-48213', description: "Supplier's delivery note number" })
  @Transform(trimToNull)
  @IsOptional()
  @IsString()
  @MaxLength(60)
  supplierRef?: string | null;

  @ApiPropertyOptional({
    example: 'FA-2026-0917',
    description: "Supplier's invoice number, when it came with the goods (with its date)",
  })
  @Transform(trimToNull)
  @IsOptional()
  @IsString()
  @MaxLength(60)
  supplierInvoiceNumber?: string | null;

  @ApiPropertyOptional({
    example: '2026-11-25',
    description: "Date printed on the supplier's invoice",
  })
  @Transform(trimToNull)
  @IsOptional()
  @IsDateString({ strict: true })
  supplierInvoiceDate?: string | null;

  @ApiPropertyOptional()
  @Transform(trimToNull)
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string | null;

  @ApiProperty({ type: [GoodsReceiptLineDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(500)
  @ValidateNested({ each: true })
  @Type(() => GoodsReceiptLineDto)
  lines: GoodsReceiptLineDto[];

  @ApiPropertyOptional({
    default: false,
    description: 'true = save as a draft (no stock movement until posted)',
  })
  @IsOptional()
  @IsBoolean()
  asDraft?: boolean;
}

/** PATCH /purchasing/receipts/:id — drafts only, same order. */
export class UpdateGoodsReceiptDto extends OmitType(CreateGoodsReceiptDto, ['asDraft'] as const) {}

export class UpdateReceivingSettingsDto {
  @ApiProperty({ example: '5', description: 'Over-receipt tolerance, 0–50 %' })
  @Transform(trim)
  @Matches(/^(50(\.0{1,2})?|[1-4]?\d(\.\d{1,2})?)$/, {
    message: 'The tolerance must be between 0 and 50 %',
  })
  tolerancePct!: string;
}

export class CancelGoodsReceiptDto {
  @ApiProperty({ example: 'Received on the wrong order' })
  @Transform(trimToNull)
  @IsString({ message: 'Enter the reason of the cancellation' })
  @MaxLength(500)
  reason!: string;
}

/** Supplier invoice of a delivered order (both fields required). */
export class SetSupplierInvoiceDto {
  @ApiProperty({ example: 'FA-2026-0917' })
  @Transform(trimToNull)
  @IsString({ message: 'Enter the number of the supplier invoice' })
  @MaxLength(60)
  supplierInvoiceNumber!: string;

  @ApiProperty({ example: '2026-11-25' })
  @Transform(trimToNull)
  @IsDateString({ strict: true }, { message: 'Enter the date of the supplier invoice' })
  supplierInvoiceDate!: string;
}

const RECEIPT_STATUS_FILTERS = [...GOODS_RECEIPT_STATUSES, 'all'] as const;

export class ListGoodsReceiptsQueryDto {
  @ApiPropertyOptional({ enum: RECEIPT_STATUS_FILTERS, default: 'all' })
  @IsOptional()
  @IsIn(RECEIPT_STATUS_FILTERS)
  status: GoodsReceiptStatusFilter = 'all';

  @ApiPropertyOptional({
    description: 'Matches the receipt number, the order number, the delivery note or the supplier',
  })
  @Transform(trimToNull)
  @IsOptional()
  @IsString()
  @MaxLength(100)
  search?: string | null;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  supplierId?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  purchaseOrderId?: string;

  @ApiPropertyOptional({ example: '2026-11-01', description: 'Received on or after' })
  @Transform(trimToNull)
  @IsOptional()
  @IsDateString({ strict: true })
  from?: string | null;

  @ApiPropertyOptional({ example: '2026-11-30', description: 'Received on or before' })
  @Transform(trimToNull)
  @IsOptional()
  @IsDateString({ strict: true })
  to?: string | null;

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

export class ExportGoodsReceiptsQueryDto extends OmitType(ListGoodsReceiptsQueryDto, [
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

const DELIVERY_FILTERS = [...DELIVERY_STATUSES, 'open', 'all'] as const;

export class ListDeliveriesQueryDto {
  @ApiPropertyOptional({
    enum: DELIVERY_FILTERS,
    default: 'open',
    description:
      'waiting = confirmed, nothing received; in_progress = partly received; delivered; open = waiting + in_progress',
  })
  @IsOptional()
  @IsIn(DELIVERY_FILTERS)
  status: DeliveryStatusFilter = 'open';

  @ApiPropertyOptional({
    description: 'Matches the order number, the supplier, or a delivery note / invoice number',
  })
  @Transform(trimToNull)
  @IsOptional()
  @IsString()
  @MaxLength(100)
  search?: string | null;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  supplierId?: string;

  @ApiPropertyOptional({ description: 'Only orders past their expected date' })
  @Transform(({ value }) => value === true || value === 'true' || value === '1')
  @IsOptional()
  @IsBoolean()
  lateOnly?: boolean;

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

export class ExportDeliveriesQueryDto extends OmitType(ListDeliveriesQueryDto, [
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
