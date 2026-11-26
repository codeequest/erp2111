import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsEmail,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
  MaxLength,
  registerDecorator,
  ValidateNested,
  ValidationOptions,
} from 'class-validator';
import { NormalizeEmail } from '../../auth/dto/login.dto';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);
/** Empty string → null so a field can be cleared. */
const trimToNull = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() || null : value;
const lowerTrimToNull = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim().toLowerCase() || null : value;

/** Record<string,string>: ≤ 20 keys, key 1–40 chars, value ≤ 200 chars. */
export function IsMetadata(options?: ValidationOptions) {
  return (object: object, propertyName: string) =>
    registerDecorator({
      name: 'isMetadata',
      target: object.constructor,
      propertyName,
      options: {
        message: 'Custom fields: at most 20, names up to 40 characters, values up to 200.',
        ...options,
      },
      validator: {
        validate(value: unknown) {
          if (value === undefined || value === null) return true;
          if (typeof value !== 'object' || Array.isArray(value)) return false;
          const entries = Object.entries(value as Record<string, unknown>);
          return (
            entries.length <= 20 &&
            entries.every(
              ([k, v]) =>
                k.trim().length > 0 && k.length <= 40 && typeof v === 'string' && v.length <= 200,
            )
          );
        },
      },
    });
}

class UserProfileFields {
  @ApiPropertyOptional()
  @IsOptional()
  @Transform(lowerTrimToNull)
  @IsString()
  @Length(3, 40)
  @Matches(/^[a-z0-9._-]+$/, {
    message: 'Username: letters, digits, dot, dash and underscore only.',
  })
  username?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(trimToNull)
  @IsString()
  @MaxLength(80)
  phone?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(trimToNull)
  @IsString()
  @MaxLength(80)
  department?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(trimToNull)
  @IsString()
  @MaxLength(80)
  jobTitle?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(trimToNull)
  @IsString()
  @MaxLength(80)
  employeeId?: string | null;

  @ApiPropertyOptional({ type: 'object', additionalProperties: { type: 'string' } })
  @IsOptional()
  @IsMetadata()
  metadata?: Record<string, string>;
}

export class RoleAssignmentDto {
  @ApiProperty()
  @IsUUID()
  roleId: string;

  @ApiPropertyOptional({ description: 'Temporary assignment: ends at this time' })
  @IsOptional()
  @IsDateString()
  expiresAt?: string | null;
}

export class CreateUserDto extends UserProfileFields {
  @ApiProperty()
  @Transform(trim)
  @IsString()
  @Length(1, 80)
  firstName: string;

  @ApiProperty()
  @Transform(trim)
  @IsString()
  @Length(1, 80)
  lastName: string;

  @ApiProperty()
  @NormalizeEmail()
  @IsEmail({}, { message: 'Enter a valid email address.' })
  @MaxLength(254)
  email: string;

  @ApiPropertyOptional({ type: [RoleAssignmentDto] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => RoleAssignmentDto)
  roles?: RoleAssignmentDto[];

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  sendInvitation?: boolean = true;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  requireMfa?: boolean = false;

  @ApiPropertyOptional({
    default: true,
    description: 'false = create the account deactivated (no invitation)',
  })
  @IsOptional()
  @IsBoolean()
  active?: boolean = true;
}

export class UpdateUserDto extends UserProfileFields {
  @ApiPropertyOptional()
  @IsOptional()
  @Transform(trim)
  @IsString()
  @Length(1, 80)
  firstName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(trim)
  @IsString()
  @Length(1, 80)
  lastName?: string;

  @ApiPropertyOptional({ description: 'Changing it un-verifies the address and sends a link' })
  @IsOptional()
  @NormalizeEmail()
  @IsEmail({}, { message: 'Enter a valid email address.' })
  @MaxLength(254)
  email?: string;

  @ApiPropertyOptional({ description: 'Requires admin.user.manage_mfa' })
  @IsOptional()
  @IsBoolean()
  requireMfa?: boolean;
}

export class SetRolesDto {
  @ApiProperty({ type: [RoleAssignmentDto] })
  @IsArray()
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => RoleAssignmentDto)
  roles: RoleAssignmentDto[];
}

export class ReasonDto {
  @ApiPropertyOptional({ maxLength: 500 })
  @IsOptional()
  @Transform(trimToNull)
  @IsString()
  @MaxLength(500)
  reason?: string | null;
}
