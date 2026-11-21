import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsOptional, IsString, Length, Matches, MaxLength } from 'class-validator';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);
/** Empty string → null, so a field can be cleared. */
const trimOrNull = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() || null : value;

export class CreateWarehouseDto {
  @ApiProperty({
    example: 'SHOP1',
    description: 'Short code, stored upper-case. Cannot change later.',
  })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toUpperCase() : value))
  @IsString()
  @Length(1, 20)
  @Matches(/^[A-Z0-9_-]+$/, { message: 'code may only contain letters, digits, "-" and "_"' })
  code: string;

  @ApiProperty({ example: 'Downtown shop' })
  @Transform(trim)
  @IsString()
  @Length(1, 100)
  name: string;

  @ApiPropertyOptional({ example: '12 Main Street' })
  @IsOptional()
  @Transform(trimOrNull)
  @IsString()
  @MaxLength(300)
  address?: string | null;
}

export class UpdateWarehouseDto {
  @ApiPropertyOptional()
  @IsOptional()
  @Transform(trim)
  @IsString()
  @Length(1, 100)
  name?: string;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @Transform(trimOrNull)
  @IsString()
  @MaxLength(300)
  address?: string | null;

  @ApiPropertyOptional({
    description: 'false = deactivate (refused while it holds stock or if it is the last one)',
  })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
