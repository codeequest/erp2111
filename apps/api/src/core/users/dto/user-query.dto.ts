import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
} from 'class-validator';
import { DisplayStatus, PAGE_SIZES } from '@erp/shared';

const STATUSES: DisplayStatus[] = ['PENDING', 'ACTIVE', 'INACTIVE', 'LOCKED'];
export const USER_SORTS = ['name', 'email', 'status', 'lastLoginAt', 'createdAt'] as const;
export type UserSort = (typeof USER_SORTS)[number];

/** `a,b` or repeated `?x=a&x=b` → ['a','b']. */
export const toList = ({ value }: { value: unknown }) => {
  if (value === undefined || value === null || value === '') return undefined;
  const parts = (Array.isArray(value) ? value : [value]).flatMap((v) => String(v).split(','));
  const list = parts.map((s) => s.trim()).filter(Boolean);
  return list.length ? list : undefined;
};
const toBool = ({ value }: { value: unknown }) =>
  value === undefined || value === '' ? undefined : value === true || value === 'true' || value === '1';
const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() || undefined : value;

/** Filters shared by the list, the export and bulk "select all matching". */
export class UserFilterDto {
  @ApiPropertyOptional({ description: 'Every word must match a name, email, username, department or role' })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(200)
  search?: string;

  @ApiPropertyOptional({ isArray: true, enum: STATUSES })
  @IsOptional()
  @Transform(toList)
  @IsIn(STATUSES, { each: true })
  status?: DisplayStatus[];

  @ApiPropertyOptional({ isArray: true, type: String })
  @IsOptional()
  @Transform(toList)
  @IsUUID('all', { each: true })
  roleIds?: string[];

  @ApiPropertyOptional({ enum: ['on', 'off'] })
  @IsOptional()
  @IsIn(['on', 'off'])
  mfa?: 'on' | 'off';

  @ApiPropertyOptional({ enum: ['yes', 'no'] })
  @IsOptional()
  @IsIn(['yes', 'no'])
  verified?: 'yes' | 'no';

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(80)
  department?: string;

  @ApiPropertyOptional({ example: '2026-01-01' })
  @IsOptional()
  @IsDateString()
  createdFrom?: string;

  @ApiPropertyOptional({ example: '2026-12-31', description: 'Inclusive' })
  @IsOptional()
  @IsDateString()
  createdTo?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  lastLoginFrom?: string;

  @ApiPropertyOptional({ description: 'Inclusive' })
  @IsOptional()
  @IsDateString()
  lastLoginTo?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(toBool)
  @IsBoolean()
  neverLoggedIn?: boolean;
}

export class UserListQueryDto extends UserFilterDto {
  @ApiPropertyOptional({ enum: USER_SORTS, default: 'name' })
  @IsOptional()
  @IsIn(USER_SORTS)
  sort?: UserSort;

  @ApiPropertyOptional({ enum: ['asc', 'desc'], default: 'asc' })
  @IsOptional()
  @IsIn(['asc', 'desc'])
  order?: 'asc' | 'desc';

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

export class UserExportQueryDto extends UserFilterDto {
  @ApiPropertyOptional({ description: 'Export only these users (comma-separated ids)' })
  @IsOptional()
  @Transform(toList)
  @IsUUID('all', { each: true })
  ids?: string[];
}

export class PageQueryDto {
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
