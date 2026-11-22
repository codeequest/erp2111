import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsOptional,
  IsUUID,
  Matches,
} from 'class-validator';
import { BULK_PRODUCT_ACTIONS, type BulkProductAction } from '@erp/shared';

export const MAX_BULK = 500;

export class BulkProductDto {
  @ApiProperty({ type: [String], format: 'uuid', maxItems: MAX_BULK })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(MAX_BULK)
  @IsUUID('all', { each: true })
  ids: string[];

  @ApiProperty({ enum: BULK_PRODUCT_ACTIONS })
  @IsIn(BULK_PRODUCT_ACTIONS)
  action: BulkProductAction;

  @ApiPropertyOptional({
    format: 'uuid',
    nullable: true,
    description: 'setCategory; null removes it',
  })
  @Transform(({ value }) => (value === '' ? null : value))
  @IsOptional()
  @IsUUID()
  categoryId?: string | null;

  @ApiPropertyOptional({ example: '5', description: 'adjustPrice: -90 to 1000 percent' })
  @IsOptional()
  @Matches(/^-?\d{1,4}(\.\d{1,2})?$/, { message: 'percent must be a number like 5 or -10' })
  @Transform(({ value }) => (typeof value === 'number' ? String(value) : value))
  percent?: string;
}

export class ImportQueryDto {
  @ApiPropertyOptional({ description: 'true = preview only, nothing is written', default: true })
  @Transform(({ value }) => !(value === false || value === 'false' || value === '0'))
  @IsOptional()
  @IsBoolean()
  dryRun: boolean = true;
}
