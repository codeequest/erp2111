import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);
const trimToNull = ({ value }: { value: unknown }) => {
  if (typeof value !== 'string') return value;
  const t = value.trim();
  return t === '' ? null : t;
};

// ── Categories ──────────────────────────────────────────────────────────────

export class CreateCategoryDto {
  @ApiProperty({ example: 'Oils' })
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name: string;

  @ApiPropertyOptional({ format: 'uuid', nullable: true, description: 'Empty = top level' })
  @Transform(trimToNull)
  @IsOptional()
  @IsUUID()
  parentId?: string | null;
}

export class UpdateCategoryDto {
  @ApiPropertyOptional()
  @Transform(trim)
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name?: string;

  @ApiPropertyOptional({ format: 'uuid', nullable: true, description: 'null = move to top level' })
  @Transform(trimToNull)
  @IsOptional()
  @IsUUID()
  parentId?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

// ── Units ───────────────────────────────────────────────────────────────────

export class CreateUnitDto {
  @ApiProperty({ example: 'CTN', description: 'Letters, digits, - and _; stored in upper case' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toUpperCase() : value))
  @Matches(/^[A-Z0-9_-]{1,10}$/, {
    message: 'code must be 1–10 letters, digits, - or _',
  })
  code: string;

  @ApiProperty({ example: 'Carton' })
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(50)
  name: string;
}

export class UpdateUnitDto {
  @ApiProperty({ example: 'Carton' })
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(50)
  name: string;
}

// ── Pack sizes ──────────────────────────────────────────────────────────────

export class PackUnitDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  unitId: string;

  @ApiProperty({ example: '24', description: 'Base units in one of this unit (> 0)' })
  @Transform(trim)
  @Matches(/^\d{1,14}(\.\d{1,4})?$/, {
    message: 'factor must be a positive number with at most 4 decimals',
  })
  factor: string;

  @ApiProperty()
  @IsBoolean()
  forPurchase: boolean;

  @ApiProperty()
  @IsBoolean()
  forSale: boolean;

  @ApiPropertyOptional({ nullable: true })
  @Transform(trimToNull)
  @IsOptional()
  @IsString()
  @MaxLength(64)
  barcode?: string | null;
}

export class SetPackUnitsDto {
  @ApiProperty({ type: [PackUnitDto] })
  @IsArray()
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => PackUnitDto)
  units: PackUnitDto[];
}
