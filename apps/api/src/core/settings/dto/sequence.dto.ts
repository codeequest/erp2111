import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsOptional, IsString, Matches, Max, Min } from 'class-validator';
import { SEQUENCE_PREFIX } from '@erp/shared';

export class UpdateSequenceDto {
  @ApiPropertyOptional({
    example: 'INV',
    description: 'Text before the number. May be empty for product codes only.',
  })
  @IsOptional()
  @IsString()
  @Matches(SEQUENCE_PREFIX, {
    message: 'prefix may only contain letters, digits and . _ - / (max 20)',
  })
  prefix?: string;

  @ApiPropertyOptional({ example: 5, minimum: 1, maximum: 10, description: 'Number of digits' })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(10)
  padding?: number;

  @ApiPropertyOptional({
    example: 1,
    minimum: 1,
    description: 'Number used next. Documents can only move forward.',
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(2_000_000_000)
  nextNumber?: number;
}
