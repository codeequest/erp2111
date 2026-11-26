import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';
import { NormalizeEmail } from './login.dto';

const SIX_DIGITS = /^\s*\d{6}\s*$/;

export class ChallengeTokenDto {
  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(4096)
  challengeToken: string;
}

export class MfaChallengeDto extends ChallengeTokenDto {
  @ApiPropertyOptional({ example: '123456' })
  @IsOptional()
  @IsString()
  @Matches(SIX_DIGITS, { message: 'Enter the 6-digit code.' })
  code?: string;

  @ApiPropertyOptional({ example: 'abcde-fghij' })
  @IsOptional()
  @IsString()
  @MaxLength(32)
  recoveryCode?: string;
}

export class MfaCodeChallengeDto extends ChallengeTokenDto {
  @ApiProperty({ example: '123456' })
  @IsString()
  @Matches(SIX_DIGITS, { message: 'Enter the 6-digit code.' })
  code: string;
}

export class NewPasswordChallengeDto extends ChallengeTokenDto {
  @ApiProperty()
  @IsString()
  @MaxLength(1024)
  newPassword: string;
}

export class EmailDto {
  @ApiProperty({ example: 'jane@company.com' })
  @NormalizeEmail()
  @IsEmail()
  @MaxLength(254)
  email: string;
}

export class TokenDto {
  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(512)
  token: string;
}

export class TokenPasswordDto extends TokenDto {
  @ApiProperty()
  @IsString()
  @MaxLength(1024)
  newPassword: string;
}
