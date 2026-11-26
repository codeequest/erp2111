import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsInt,
  IsOptional,
  Max,
  Min,
  registerDecorator,
  ValidationArguments,
} from 'class-validator';

/** passwordMaxLength must be ≥ passwordMinLength when both are sent. */
function NotBelowMin() {
  return (object: object, propertyName: string) =>
    registerDecorator({
      name: 'notBelowMin',
      target: object.constructor,
      propertyName,
      options: { message: 'The maximum length must be at least the minimum length.' },
      validator: {
        validate(value: unknown, args: ValidationArguments) {
          const min = (args.object as UpdatePolicyDto).passwordMinLength;
          return typeof value !== 'number' || typeof min !== 'number' || value >= min;
        },
      },
    });
}

const int = (min: number, max: number) => [IsOptional(), IsInt(), Min(min), Max(max)];
const apply =
  (...ds: PropertyDecorator[]): PropertyDecorator =>
  (target, key) =>
    ds.forEach((d) => d(target, key));

/** PATCH /security/policy — every field optional; ranges per spec. */
export class UpdatePolicyDto {
  @ApiPropertyOptional({ minimum: 8, maximum: 64 })
  @apply(...int(8, 64))
  passwordMinLength?: number;

  @ApiPropertyOptional({ minimum: 64, maximum: 256 })
  @apply(...int(64, 256))
  @NotBelowMin()
  passwordMaxLength?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  blockBreachedPasswords?: boolean;

  @ApiPropertyOptional({ description: 'HaveIBeenPwned k-anonymity lookup (external call)' })
  @IsOptional()
  @IsBoolean()
  breachApiCheck?: boolean;

  @ApiPropertyOptional({ minimum: 3, maximum: 20 })
  @apply(...int(3, 20))
  lockoutThreshold?: number;

  @ApiPropertyOptional({ minimum: 1, maximum: 1440 })
  @apply(...int(1, 1440))
  lockoutMinutes?: number;

  @ApiPropertyOptional({ minimum: 1, maximum: 720 })
  @apply(...int(1, 720))
  invitationTtlHours?: number;

  @ApiPropertyOptional({ minimum: 10, maximum: 1440 })
  @apply(...int(10, 1440))
  resetTtlMinutes?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  requireMfaForPrivileged?: boolean;

  @ApiPropertyOptional({ minimum: 7, maximum: 365 })
  @apply(...int(7, 365))
  accessReviewDays?: number;

  @ApiPropertyOptional({ minimum: 7, maximum: 365 })
  @apply(...int(7, 365))
  dormantDays?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  revokeSessionsOnPasswordReset?: boolean;
}
