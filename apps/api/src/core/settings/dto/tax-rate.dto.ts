import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

/** Percentage 0–100 with up to 2 decimals (column is DECIMAL(5,2)). */
const RATE = /^(100(\.0{1,2})?|\d{1,2}(\.\d{1,2})?)$/;
const RATE_MESSAGE = 'rate must be a percentage between 0 and 100 with at most 2 decimals';

export class CreateTaxRateDto {
  @ApiProperty({ example: 'VAT 19%' })
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(50)
  name: string;

  @ApiProperty({ example: '19.00' })
  @Transform(trim)
  @Matches(RATE, { message: RATE_MESSAGE })
  rate: string;
}

export class UpdateTaxRateDto {
  @ApiPropertyOptional()
  @Transform(trim)
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(50)
  name?: string;

  @ApiPropertyOptional({ example: '19.00' })
  @Transform(trim)
  @IsOptional()
  @Matches(RATE, { message: RATE_MESSAGE })
  rate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
