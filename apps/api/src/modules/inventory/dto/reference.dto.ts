import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  ValidateIf,
} from 'class-validator';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

export class CreateUnitDto {
  @ApiProperty({ example: 'CTN' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toUpperCase() : value))
  @IsString()
  @Matches(/^[A-Z0-9]{1,10}$/, { message: 'code must be 1-10 letters or digits' })
  code: string;

  @ApiProperty({ example: 'Carton' })
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  name: string;
}

export class CreateCategoryDto {
  @ApiProperty({ example: 'Beverages' })
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name: string;

  @ApiPropertyOptional({ format: 'uuid', nullable: true, description: 'Empty = top level' })
  @ValidateIf((_o, v) => v !== null && v !== undefined && v !== '')
  @IsUUID()
  parentId?: string | null;
}

export class UpdateCategoryDto {
  @ApiPropertyOptional()
  @Transform(trim)
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name?: string;

  @ApiPropertyOptional({ format: 'uuid', nullable: true, description: 'null = move to top level' })
  @ValidateIf((_o, v) => v !== null && v !== undefined && v !== '')
  @IsUUID()
  parentId?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
