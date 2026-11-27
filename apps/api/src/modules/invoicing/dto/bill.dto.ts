import { ApiProperty, ApiPropertyOptional, OmitType } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
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
  MinLength,
  ValidateNested,
} from 'class-validator';
import {
  BILL_STATUSES,
  CURRENCIES,
  DISCOUNT_TYPES,
  PAYMENT_METHODS,
  type BillStatusFilter,
  type CurrencyCode,
  type DiscountTypeCode,
  type PaymentMethodCode,
} from '@erp/shared';

/** Non-negative decimal with up to 4 decimals, sent as a string. */
const DECIMAL = /^\d{1,14}(\.\d{1,4})?$/;
/** Money: up to 3 decimals (the currency's own precision is checked by the service). */
const MONEY = /^\d{1,14}(\.\d{1,3})?$/;
/** 0–100 with up to 2 decimals */
const PERCENT = /^(100(\.0{1,2})?|\d{1,2}(\.\d{1,2})?)$/;

const trimToNull = ({ value }: { value: unknown }) => {
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
};
const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);
const upper = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim().toUpperCase() : value;

export class BillLineDto {
  @ApiPropertyOptional({ format: 'uuid', description: 'The received line this line pays for' })
  @IsOptional()
  @IsUUID()
  goodsReceiptLineId?: string | null;

  @ApiPropertyOptional({ format: 'uuid', description: 'Free lines: a product, or none' })
  @IsOptional()
  @IsUUID()
  productId?: string | null;

  @ApiProperty({ example: 'Transport costs' })
  @Transform(trim)
  @IsString()
  @MinLength(1, { message: 'Every line needs a description' })
  @MaxLength(300)
  description!: string;

  @ApiProperty({ example: '12' })
  @Transform(trim)
  @Matches(DECIMAL, { message: 'quantity must be a positive number with at most 4 decimals' })
  quantity!: string;

  @ApiProperty({ example: '4.250' })
  @Transform(trim)
  @Matches(DECIMAL, { message: 'unit price must be a non-negative number with at most 4 decimals' })
  unitPrice!: string;

  @ApiPropertyOptional({ example: '5', default: '0' })
  @Transform(trim)
  @IsOptional()
  @Matches(PERCENT, { message: 'discount must be between 0 and 100' })
  discountPct?: string;

  @ApiPropertyOptional({ format: 'uuid', description: 'null = no VAT' })
  @IsOptional()
  @IsUUID()
  taxRateId?: string | null;
}

export class CreateBillDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  supplierId!: string;

  @ApiPropertyOptional({ example: 'FA-2026-0917', description: "The supplier's own bill number" })
  @Transform(trimToNull)
  @IsOptional()
  @IsString()
  @MaxLength(60)
  supplierRef?: string | null;

  @ApiPropertyOptional({ example: '2026-11-25', description: 'Default today' })
  @IsOptional()
  @IsDateString({ strict: true })
  issueDate?: string;

  @ApiPropertyOptional({
    example: '2026-12-25',
    description: "Default issue date + the supplier's payment terms",
  })
  @Transform(trimToNull)
  @IsOptional()
  @IsDateString({ strict: true })
  dueDate?: string | null;

  @ApiProperty({ enum: CURRENCIES, example: 'TND' })
  @Transform(upper)
  @IsIn(CURRENCIES, { message: 'currency must be TND, EUR or USD' })
  currency!: CurrencyCode;

  @ApiPropertyOptional({ enum: DISCOUNT_TYPES, nullable: true })
  @IsOptional()
  @IsIn(DISCOUNT_TYPES)
  discountType?: DiscountTypeCode | null;

  @ApiPropertyOptional({ example: '0', description: 'A % (PERCENT) or an amount (AMOUNT)' })
  @Transform(trim)
  @IsOptional()
  @Matches(DECIMAL, { message: 'discount must be a non-negative number' })
  discountValue?: string;

  @ApiPropertyOptional()
  @Transform(trimToNull)
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string | null;

  @ApiProperty({ type: [BillLineDto] })
  @IsArray()
  @ArrayMinSize(1, { message: 'Add at least one line' })
  @ArrayMaxSize(500)
  @ValidateNested({ each: true })
  @Type(() => BillLineDto)
  lines!: BillLineDto[];
}

export class UpdateBillDto extends CreateBillDto {}

export class CancelBillDto {
  @ApiProperty({ example: 'Entered twice' })
  @Transform(trimToNull)
  @IsString({ message: 'Enter the reason of the cancellation' })
  @MaxLength(500)
  reason!: string;
}

const BILL_FILTERS = [...BILL_STATUSES, 'open', 'overdue', 'all'] as const;

export class ListBillsQueryDto {
  @ApiPropertyOptional({ enum: BILL_FILTERS, default: 'all' })
  @IsOptional()
  @IsIn(BILL_FILTERS)
  status: BillStatusFilter = 'all';

  @ApiPropertyOptional({ description: 'Matches the bill number, the supplier ref or the supplier' })
  @Transform(trimToNull)
  @IsOptional()
  @IsString()
  @MaxLength(100)
  search?: string | null;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  supplierId?: string;

  @ApiPropertyOptional({ enum: CURRENCIES })
  @Transform(upper)
  @IsOptional()
  @IsIn(CURRENCIES)
  currency?: CurrencyCode;

  @ApiPropertyOptional({ example: '2026-11-01', description: 'Issued on or after' })
  @Transform(trimToNull)
  @IsOptional()
  @IsDateString({ strict: true })
  from?: string | null;

  @ApiPropertyOptional({ example: '2026-11-30', description: 'Issued on or before' })
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

export class ExportBillsQueryDto extends OmitType(ListBillsQueryDto, [
  'page',
  'pageSize',
] as const) {
  @ApiPropertyOptional({ enum: ['en', 'fr'], default: 'en' })
  @IsOptional()
  @IsIn(['en', 'fr'])
  lang: 'en' | 'fr' = 'en';
}

export class BillableQueryDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  supplierId!: string;

  @ApiPropertyOptional({ format: 'uuid', description: 'Only this order' })
  @IsOptional()
  @IsUUID()
  purchaseOrderId?: string;
}

// ── Payments ─────────────────────────────────────────────────────────────────

export class PaymentAllocationDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  invoiceId!: string;

  @ApiProperty({ example: '150.000' })
  @Transform(trim)
  @Matches(MONEY, { message: 'amount must be a positive number with at most 3 decimals' })
  amount!: string;
}

export class CreatePaymentDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  supplierId!: string;

  @ApiProperty({ enum: PAYMENT_METHODS })
  @IsIn(PAYMENT_METHODS)
  method!: PaymentMethodCode;

  @ApiProperty({ enum: CURRENCIES })
  @Transform(upper)
  @IsIn(CURRENCIES, { message: 'currency must be TND, EUR or USD' })
  currency!: CurrencyCode;

  @ApiProperty({ example: '150.000', description: 'Must equal the sum of the allocations' })
  @Transform(trim)
  @Matches(MONEY, { message: 'amount must be a positive number with at most 3 decimals' })
  amount!: string;

  @ApiPropertyOptional({ example: '2026-11-27', description: 'Default today' })
  @IsOptional()
  @IsDateString({ strict: true })
  paidAt?: string;

  @ApiPropertyOptional({ example: 'CHQ 0045871', description: 'Cheque number, bank reference…' })
  @Transform(trimToNull)
  @IsOptional()
  @IsString()
  @MaxLength(100)
  reference?: string | null;

  @ApiPropertyOptional()
  @Transform(trimToNull)
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string | null;

  @ApiProperty({ type: [PaymentAllocationDto] })
  @IsArray()
  @ArrayMinSize(1, { message: 'Choose at least one bill to pay' })
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => PaymentAllocationDto)
  allocations!: PaymentAllocationDto[];
}

export class ListPaymentsQueryDto {
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  supplierId?: string;

  @ApiPropertyOptional({ format: 'uuid', description: 'Payments allocated to this bill' })
  @IsOptional()
  @IsUUID()
  invoiceId?: string;

  @ApiPropertyOptional({ description: 'Matches the payment number, the reference or the supplier' })
  @Transform(trimToNull)
  @IsOptional()
  @IsString()
  @MaxLength(100)
  search?: string | null;

  @ApiPropertyOptional({ enum: PAYMENT_METHODS })
  @IsOptional()
  @IsIn(PAYMENT_METHODS)
  method?: PaymentMethodCode;

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
