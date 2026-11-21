import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class CreateTaxRateDto {
  @ApiProperty({ example: 'TVA 19 %' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MinLength(1)
  @MaxLength(50)
  name: string;

  @ApiProperty({ example: 19, description: 'Percentage, 0–100, up to 2 decimals' })
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(100)
  rate: number;

  @ApiPropertyOptional({
    description: 'Make it the company default (used when a product has no rate)',
  })
  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;
}

export class UpdateTaxRateDto extends PartialType(CreateTaxRateDto) {
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
