import { ApiProperty } from '@nestjs/swagger';
import { IsString, Matches, MaxLength, MinLength } from 'class-validator';

export class ChangePasswordDto {
  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(1024)
  currentPassword: string;

  @ApiProperty()
  @IsString()
  @MaxLength(1024)
  newPassword: string;
}

export class MfaCodeDto {
  @ApiProperty({ example: '123456', description: 'A 6-digit code, or a recovery code' })
  @IsString()
  @Matches(/^\s*(\d{6}|[A-Za-z2-7]{5}-[A-Za-z2-7]{5})\s*$/, {
    message: 'Enter the 6-digit code or a recovery code.',
  })
  code: string;
}
