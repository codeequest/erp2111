import { ApiProperty, ApiPropertyOptional, OmitType, PartialType } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsEmail,
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
} from 'class-validator';
import { SUPPLIER_STATUS_FILTERS, normalizeRne, type SupplierStatusFilter } from '@erp/shared';

/** Trims strings; turns "" into null so optional fields can be cleared. */
const trimToNull = ({ value }: { value: unknown }) => {
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
};
const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);
const upperTrim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim().toUpperCase() : value;

export class CreateSupplierDto {
  @ApiPropertyOptional({
    example: 'SUP-00001',
    description: 'Left empty: the next SUP-NNNNN code is used',
  })
  @Transform(upperTrim)
  @IsOptional()
  @IsString()
  @Matches(/^$|^[A-Z0-9_-]{1,20}$/, {
    message: 'code may only contain letters, digits, - and _ (max 20)',
  })
  code?: string;

  @ApiProperty({ example: 'Atlas Beverages SARL' })
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name: string;

  @ApiPropertyOptional({
    example: '1234567A',
    description: 'Tunisian RNE identifier (7 digits + key letter); empty for foreign suppliers',
  })
  @Transform(({ value }) =>
    typeof value === 'string' ? (value.trim() === '' ? null : normalizeRne(value)) : value,
  )
  @IsOptional()
  @Matches(/^\d{7}[A-Z]$/, {
    message: 'rne must be 7 digits followed by the key letter, e.g. 1234567A',
  })
  rne?: string | null;

  @ApiPropertyOptional({ example: 'orders@atlas.example' })
  @Transform(trimToNull)
  @IsOptional()
  @IsEmail({}, { message: 'email must be a valid e-mail address' })
  @MaxLength(200)
  email?: string | null;

  @ApiPropertyOptional()
  @Transform(trimToNull)
  @IsOptional()
  @IsString()
  @MaxLength(50)
  phone?: string | null;

  @ApiPropertyOptional()
  @Transform(trimToNull)
  @IsOptional()
  @IsString()
  @MaxLength(500)
  address?: string | null;

  @ApiPropertyOptional({
    example: '1234567A/A/M/000',
    description: 'Tax ID (matricule fiscal for Tunisian suppliers)',
  })
  @Transform(({ value }) => {
    const v = trimToNull({ value });
    return typeof v === 'string' ? v.toUpperCase() : v;
  })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  taxId?: string | null;

  @ApiPropertyOptional({
    format: 'uuid',
    nullable: true,
    description: "VAT applied to this supplier's purchases; null = each product's own rate",
  })
  @Transform(trimToNull)
  @IsOptional()
  @IsUUID()
  taxRateId?: string | null;

  @ApiPropertyOptional({ default: 0, description: 'Payment term in days (0 = cash)' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(365)
  paymentTermDays?: number;

  @ApiPropertyOptional()
  @Transform(trimToNull)
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string | null;
}

export class UpdateSupplierDto extends PartialType(CreateSupplierDto) {
  @ApiPropertyOptional({ description: 'false deactivates the supplier (soft delete)' })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class ListSuppliersQueryDto {
  @ApiPropertyOptional({ description: 'Matches code, name, RNE, tax ID, e-mail or phone' })
  @Transform(trimToNull)
  @IsOptional()
  @IsString()
  @MaxLength(100)
  search?: string | null;

  @ApiPropertyOptional({ enum: SUPPLIER_STATUS_FILTERS, default: 'active' })
  @IsOptional()
  @IsIn(SUPPLIER_STATUS_FILTERS)
  status: SupplierStatusFilter = 'active';

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

export class ExportSuppliersQueryDto extends OmitType(ListSuppliersQueryDto, [
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
  lang: 'en' | 'fr' = 'en';
}
