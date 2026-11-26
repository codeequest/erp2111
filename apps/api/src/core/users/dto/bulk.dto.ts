import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  ValidateIf,
} from 'class-validator';
import { BulkUserAction } from '@erp/shared';

export const BULK_ACTIONS: BulkUserAction[] = ['activate', 'deactivate', 'assignRoles', 'removeRoles'];

export class BulkUserDto {
  @ApiProperty({ enum: BULK_ACTIONS })
  @IsIn(BULK_ACTIONS)
  action: BulkUserAction;

  @ApiProperty({ type: [String], maxItems: 200 })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(200, { message: 'Select at most 200 users at a time.' })
  @ArrayUnique()
  @IsUUID('all', { each: true })
  userIds: string[];

  @ApiPropertyOptional({ type: [String], description: 'For assignRoles / removeRoles' })
  @ValidateIf((o: BulkUserDto) => o.action === 'assignRoles' || o.action === 'removeRoles')
  @IsArray()
  @ArrayMinSize(1, { message: 'Choose at least one role.' })
  @ArrayMaxSize(50)
  @IsUUID('all', { each: true })
  roleIds?: string[];

  @ApiPropertyOptional({ maxLength: 500, description: 'For deactivate' })
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() || null : value))
  @IsString()
  @MaxLength(500)
  reason?: string | null;
}
