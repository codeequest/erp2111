import { BadRequestException, Body, Controller, Get, HttpCode, Post, Req, Res } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Request, Response } from 'express';
import {
  AuthResponse,
  AuthUser,
  LoginResult,
  MfaEnrollStart,
  PasswordPolicyHints,
} from '@erp/shared';
import { Public } from '../../common/decorators/public.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Client, ClientInfo } from '../../common/client-info';
import { RateLimit, RateLimitOptions } from '../../common/rate-limit/rate-limit.decorator';
import { RequestUser } from '../../common/types/request-user';
import { AuthService, IssuedSession, LoginOutcome, normalizeEmail } from './auth.service';
import {
  ChallengeTokenDto,
  EmailDto,
  MfaChallengeDto,
  MfaCodeChallengeDto,
  NewPasswordChallengeDto,
  TokenDto,
  TokenPasswordDto,
} from './dto/auth-flows.dto';
import { LoginDto } from './dto/login.dto';

const REFRESH_COOKIE = 'erp_refresh';
const COOKIE_PATH = '/api/v1/auth';

const MIN = 60_000;
const HOUR = 60 * MIN;
const ip = (req: Request) => req.ip ?? 'unknown';
const bodyEmail = (req: Request) => {
  const e = (req.body as { email?: unknown } | undefined)?.email;
  return typeof e === 'string' ? normalizeEmail(e) : '';
};
const perIp = (name: string, limit: number, windowMs: number): RateLimitOptions => ({
  name,
  limit,
  windowMs,
  key: ip,
});
// Per-token attempt limits live in AuthService; this only caps brute force per IP.
const CHALLENGE_LIMIT = perIp('challenge', 60, 15 * MIN);

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly config: ConfigService,
  ) {}

  @Public()
  @Post('login')
  @HttpCode(200)
  @RateLimit({
    name: 'login',
    limit: 10,
    windowMs: 15 * MIN,
    key: (req) => `${ip(req)}|${bodyEmail(req)}`,
  })
  @ApiOperation({ summary: 'Log in; returns a session or the next sign-in step' })
  async login(
    @Body() dto: LoginDto,
    @Client() client: ClientInfo,
    @Res({ passthrough: true }) res: Response,
  ): Promise<LoginResult> {
    return this.result(await this.auth.login(dto.email, dto.password, client), res);
  }

  @Public()
  @Post('challenge/mfa')
  @HttpCode(200)
  @RateLimit(CHALLENGE_LIMIT)
  @ApiOperation({ summary: 'Sign-in step: TOTP code or a recovery code' })
  async challengeMfa(
    @Body() dto: MfaChallengeDto,
    @Client() client: ClientInfo,
    @Res({ passthrough: true }) res: Response,
  ): Promise<LoginResult> {
    if (!dto.code === !dto.recoveryCode) {
      throw new BadRequestException('Enter either a code or a recovery code.');
    }
    const outcome = await this.auth.challengeMfa(
      dto.challengeToken,
      { code: dto.code, recoveryCode: dto.recoveryCode },
      client,
    );
    return this.result(outcome, res);
  }

  @Public()
  @Post('challenge/mfa-enroll/start')
  @HttpCode(200)
  @RateLimit(CHALLENGE_LIMIT)
  @ApiOperation({ summary: 'Sign-in step: begin two-step verification set-up' })
  challengeEnrollStart(@Body() dto: ChallengeTokenDto): Promise<MfaEnrollStart> {
    return this.auth.challengeMfaEnrollStart(dto.challengeToken);
  }

  @Public()
  @Post('challenge/mfa-enroll/confirm')
  @HttpCode(200)
  @RateLimit(CHALLENGE_LIMIT)
  @ApiOperation({ summary: 'Sign-in step: confirm set-up; returns recovery codes once' })
  async challengeEnrollConfirm(
    @Body() dto: MfaCodeChallengeDto,
    @Client() client: ClientInfo,
    @Res({ passthrough: true }) res: Response,
  ): Promise<LoginResult & { recoveryCodes: string[] }> {
    const { outcome, recoveryCodes } = await this.auth.challengeMfaEnrollConfirm(
      dto.challengeToken,
      dto.code,
      client,
    );
    return { ...this.result(outcome, res), recoveryCodes };
  }

  @Public()
  @Post('challenge/password')
  @HttpCode(200)
  @RateLimit(CHALLENGE_LIMIT)
  @ApiOperation({ summary: 'Sign-in step: choose a new password' })
  async challengePassword(
    @Body() dto: NewPasswordChallengeDto,
    @Client() client: ClientInfo,
    @Res({ passthrough: true }) res: Response,
  ): Promise<LoginResult> {
    return this.result(
      await this.auth.challengePassword(dto.challengeToken, dto.newPassword, client),
      res,
    );
  }

  @Public()
  @Post('forgot-password')
  @HttpCode(202)
  @RateLimit(
    { name: 'forgot-email', limit: 3, windowMs: HOUR, key: bodyEmail },
    perIp('forgot-ip', 10, HOUR),
  )
  @ApiOperation({ summary: 'Email a reset link (same answer whether or not the email exists)' })
  forgotPassword(@Body() dto: EmailDto, @Client() client: ClientInfo): Promise<{ ok: true }> {
    return this.auth.forgotPassword(dto.email, client);
  }

  @Public()
  @Post('reset-password')
  @HttpCode(204)
  @RateLimit(perIp('reset', 10, HOUR))
  @ApiOperation({ summary: 'Set a new password with a reset link' })
  async resetPassword(@Body() dto: TokenPasswordDto, @Client() client: ClientInfo): Promise<void> {
    await this.auth.resetPassword(dto.token, dto.newPassword, client);
  }

  @Public()
  @Post('invitation/inspect')
  @HttpCode(200)
  @RateLimit(perIp('invite', 10, HOUR))
  @ApiOperation({ summary: 'Who an invitation link is for' })
  inspectInvitation(@Body() dto: TokenDto): Promise<{ email: string; firstName: string }> {
    return this.auth.inspectInvitation(dto.token);
  }

  @Public()
  @Post('invitation/accept')
  @HttpCode(200)
  @RateLimit(perIp('invite', 10, HOUR))
  @ApiOperation({ summary: 'Accept an invitation by choosing a password' })
  async acceptInvitation(
    @Body() dto: TokenPasswordDto,
    @Client() client: ClientInfo,
    @Res({ passthrough: true }) res: Response,
  ): Promise<LoginResult> {
    return this.result(await this.auth.acceptInvitation(dto.token, dto.newPassword, client), res);
  }

  @Public()
  @Post('verify-email')
  @HttpCode(204)
  @RateLimit(perIp('verify', 10, HOUR))
  @ApiOperation({ summary: 'Confirm an email address' })
  async verifyEmail(@Body() dto: TokenDto, @Client() client: ClientInfo): Promise<void> {
    await this.auth.verifyEmail(dto.token, client);
  }

  @Public()
  @Get('password-policy')
  @ApiOperation({ summary: 'Password length rules, for form hints' })
  passwordPolicy(): Promise<PasswordPolicyHints> {
    return this.auth.passwordPolicyHints();
  }

  @Public()
  @Post('refresh')
  @HttpCode(200)
  @ApiOperation({ summary: 'Get a new access token using the refresh cookie' })
  async refresh(
    @Req() req: Request,
    @Client() client: ClientInfo,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthResponse> {
    const session = await this.auth.refresh(req.cookies?.[REFRESH_COOKIE], client);
    return this.respond(session, res);
  }

  @Public()
  @Post('logout')
  @HttpCode(204)
  @ApiOperation({ summary: 'End the session and clear the cookie' })
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response): Promise<void> {
    await this.auth.logout(req.cookies?.[REFRESH_COOKIE]);
    res.clearCookie(REFRESH_COOKIE, { path: COOKIE_PATH });
  }

  @Get('me')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'The logged-in user, their roles and permissions' })
  me(@CurrentUser() user: RequestUser): AuthUser {
    return this.auth.me(user);
  }

  private result(outcome: LoginOutcome, res: Response): LoginResult {
    if (outcome.kind === 'challenge') return outcome;
    return { kind: 'session', ...this.respond(outcome.session, res) };
  }

  private respond(session: IssuedSession, res: Response): AuthResponse {
    res.cookie(REFRESH_COOKIE, session.refreshToken, {
      httpOnly: true,
      sameSite: 'lax',
      secure: this.config.get('COOKIE_SECURE') === 'true',
      path: COOKIE_PATH,
      expires: session.refreshExpiresAt,
    });
    return { accessToken: session.accessToken, user: session.user };
  }
}
