import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsString, Length, Matches } from 'class-validator';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

export class CreateUnitDto {
  @ApiProperty({ example: 'CTN', description: 'Short code, stored upper-case' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toUpperCase() : value))
  @IsString()
  @Length(1, 10)
  @Matches(/^[A-Z0-9_-]+$/, { message: 'code may only contain letters, digits, "-" and "_"' })
  code: string;

  @ApiProperty({ example: 'Carton' })
  @Transform(trim)
  @IsString()
  @Length(1, 50)
  name: string;
}
