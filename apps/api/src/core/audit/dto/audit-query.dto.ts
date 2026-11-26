import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsDateString,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
} from 'class-validator';
import { AuditResult, PAGE_SIZES } from '@erp/shared';
import { toList } from '../../users/dto/user-query.dto';

const RESULTS: AuditResult[] = ['SUCCESS', 'FAILURE', 'DENIED'];
const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() || undefined : value;

export class AuditQueryDto {
  @ApiPropertyOptional({ description: 'Who did it' })
  @IsOptional()
  @IsUUID()
  actorId?: string;

  @ApiPropertyOptional({ example: 'User' })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(60)
  targetType?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(80)
  targetId?: string;

  @ApiPropertyOptional({ isArray: true, type: String, example: 'user.created,user.deactivated' })
  @IsOptional()
  @Transform(toList)
  @IsString({ each: true })
  @MaxLength(80, { each: true })
  action?: string[];

  @ApiPropertyOptional({ enum: RESULTS })
  @IsOptional()
  @IsIn(RESULTS)
  result?: AuditResult;

  @ApiPropertyOptional({ example: '2026-01-01' })
  @IsOptional()
  @IsDateString()
  from?: string;

  @ApiPropertyOptional({ example: '2026-01-31', description: 'Inclusive' })
  @IsOptional()
  @IsDateString()
  to?: string;

  @ApiPropertyOptional({ description: 'Target name/email or action' })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(200)
  search?: string;

  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;

  @ApiPropertyOptional({ enum: PAGE_SIZES, default: 25 })
  @IsOptional()
  @Type(() => Number)
  @IsIn(PAGE_SIZES as unknown as number[])
  pageSize: number = 25;
}
