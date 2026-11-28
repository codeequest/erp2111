import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);
const trimToNull = ({ value }: { value: unknown }) => {
  if (typeof value !== 'string') return value;
  const t = value.trim();
  return t === '' ? null : t;
};

export class ListWarehousesQueryDto {
  @ApiPropertyOptional({ description: 'Include inactive warehouses', default: false })
  @Transform(({ value }) => value === true || value === 'true' || value === '1')
  @IsOptional()
  @IsBoolean()
  includeInactive: boolean = false;
}

export class CreateWarehouseDto {
  @ApiProperty({ example: 'SFAX', description: 'Letters, digits, - and _; stored in upper case' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toUpperCase() : value))
  @Matches(/^[A-Z0-9_-]{1,20}$/, { message: 'code must be 1–20 letters, digits, - or _' })
  code: string;

  @ApiProperty({ example: 'Sfax shop' })
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name: string;

  @ApiPropertyOptional({ example: 'Avenue Habib Bourguiba, Sfax', nullable: true })
  @Transform(trimToNull)
  @IsOptional()
  @IsString()
  @MaxLength(300)
  address?: string | null;
}

/** The code cannot change: it is printed on documents and used in imports. */
export class UpdateWarehouseDto {
  @ApiPropertyOptional({ example: 'Sfax shop' })
  @Transform(trim)
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name?: string;

  @ApiPropertyOptional({ nullable: true })
  @Transform(trimToNull)
  @IsOptional()
  @IsString()
  @MaxLength(300)
  address?: string | null;

  @ApiPropertyOptional({ description: 'false = deactivate (only when the warehouse is empty)' })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class OpeningImportQueryDto {
  @ApiPropertyOptional({ description: 'true = preview only, nothing is written', default: true })
  @Transform(({ value }) => !(value === false || value === 'false' || value === '0'))
  @IsOptional()
  @IsBoolean()
  dryRun: boolean = true;

  @ApiPropertyOptional({
    format: 'uuid',
    description: 'Warehouse for rows whose "warehouse" cell is empty',
  })
  @IsOptional()
  @IsUUID()
  warehouseId?: string;
}
