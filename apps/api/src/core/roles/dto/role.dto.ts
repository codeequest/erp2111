import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { ALL_PERMISSIONS, PAGE_SIZES, ROLE_COLORS, ROLE_TEMPLATES, RoleColor } from '@erp/shared';
import { toList } from '../../users/dto/user-query.dto';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);
const trimToNull = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() || null : value;
const CODES = ALL_PERMISSIONS as string[];
const MAX_PERMS = ALL_PERMISSIONS.length;

export class CreateRoleDto {
  @ApiProperty({ minLength: 2, maxLength: 60 })
  @Transform(trim)
  @IsString()
  @Length(2, 60)
  name: string;

  @ApiPropertyOptional({ maxLength: 500 })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(500)
  description?: string;

  @ApiProperty({ enum: ROLE_COLORS })
  @IsIn(ROLE_COLORS)
  color: RoleColor;

  @ApiPropertyOptional({ maxLength: 60 })
  @IsOptional()
  @Transform(trimToNull)
  @IsString()
  @MaxLength(60)
  category?: string | null;

  @ApiPropertyOptional({ type: [String], description: 'Needs admin.permission.manage when not empty' })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MAX_PERMS)
  @IsIn(CODES, { each: true })
  permissions?: string[];

  @ApiPropertyOptional({ description: 'Start from the permissions of this role' })
  @IsOptional()
  @IsUUID()
  cloneFromId?: string;

  @ApiPropertyOptional({ enum: ROLE_TEMPLATES.map((t) => t.key) })
  @IsOptional()
  @IsIn(ROLE_TEMPLATES.map((t) => t.key))
  templateKey?: string;
}

export class UpdateRoleDto {
  @ApiProperty({ description: 'Version you loaded (optimistic locking)' })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  version: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(trim)
  @IsString()
  @Length(2, 60)
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(500)
  description?: string;

  @ApiPropertyOptional({ enum: ROLE_COLORS })
  @IsOptional()
  @IsIn(ROLE_COLORS)
  color?: RoleColor;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(trimToNull)
  @IsString()
  @MaxLength(60)
  category?: string | null;

  @ApiPropertyOptional({ type: [String], description: 'Needs admin.permission.manage' })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MAX_PERMS)
  @IsIn(CODES, { each: true })
  permissions?: string[];
}

export class ImpactDto {
  @ApiProperty({ type: [String] })
  @IsArray()
  @ArrayMaxSize(MAX_PERMS)
  @IsIn(CODES, { each: true })
  permissions: string[];
}

export class MatrixRoleDto {
  @ApiProperty()
  @IsUUID()
  id: string;

  @ApiProperty()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  version: number;

  @ApiProperty({ type: [String] })
  @IsArray()
  @ArrayMaxSize(MAX_PERMS)
  @IsIn(CODES, { each: true })
  permissions: string[];
}

export class MatrixSaveDto {
  @ApiProperty({ type: [MatrixRoleDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => MatrixRoleDto)
  roles: MatrixRoleDto[];
}

export const ROLE_SORTS = ['name', 'userCount', 'permissionCount', 'createdAt', 'updatedAt'] as const;

export class RoleListQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() || undefined : value))
  @IsString()
  @MaxLength(100)
  search?: string;

  @ApiPropertyOptional({ enum: ['SYSTEM', 'CUSTOM'] })
  @IsOptional()
  @IsIn(['SYSTEM', 'CUSTOM'])
  type?: 'SYSTEM' | 'CUSTOM';

  @ApiPropertyOptional({ enum: ROLE_SORTS, default: 'name' })
  @IsOptional()
  @IsIn(ROLE_SORTS)
  sort?: (typeof ROLE_SORTS)[number];

  @ApiPropertyOptional({ enum: ['asc', 'desc'] })
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

export class CompareQueryDto {
  @ApiProperty({ description: '2 to 4 role ids, comma-separated' })
  @Transform(toList)
  @IsArray()
  @ArrayMinSize(2, { message: 'Choose 2 to 4 roles to compare.' })
  @ArrayMaxSize(4, { message: 'Choose 2 to 4 roles to compare.' })
  @ArrayUnique()
  @IsUUID('all', { each: true })
  ids: string[];

  @ApiPropertyOptional({ description: 'Include permissions that are the same for all roles' })
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true' || value === '1')
  @IsBoolean()
  all?: boolean;
}

export class DeleteRoleQueryDto {
  @ApiPropertyOptional({ description: 'Move the users of this role to that role first' })
  @IsOptional()
  @IsUUID()
  reassignToRoleId?: string;
}
