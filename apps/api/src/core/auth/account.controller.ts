import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AccountSecurity, MfaEnrollStart } from '@erp/shared';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Client, ClientInfo } from '../../common/client-info';
import { RateLimit } from '../../common/rate-limit/rate-limit.decorator';
import { RequestUser } from '../../common/types/request-user';
import { AccountService } from './account.service';
import { ChangePasswordDto, MfaCodeDto } from './dto/account.dto';

// Self-service: authenticated, no permission needed, only ever acts on the caller.
const PER_USER = (name: string) => ({
  name,
  limit: 10,
  windowMs: 15 * 60_000,
  key: (req: { user?: { id?: string }; ip?: string }) => req.user?.id ?? req.ip ?? 'unknown',
});

@ApiTags('Account')
@ApiBearerAuth()
@Controller('account')
export class AccountController {
  constructor(private readonly account: AccountService) {}

  @Get('security')
  @ApiOperation({ summary: 'My password, two-step verification and sessions' })
  security(@CurrentUser() me: RequestUser): Promise<AccountSecurity> {
    return this.account.security(me);
  }

  @Post('password')
  @HttpCode(204)
  @RateLimit(PER_USER('account-password'))
  @ApiOperation({ summary: 'Change my password (signs out my other sessions)' })
  async changePassword(
    @CurrentUser() me: RequestUser,
    @Body() dto: ChangePasswordDto,
    @Client() client: ClientInfo,
  ): Promise<void> {
    await this.account.changePassword(me, dto.currentPassword, dto.newPassword, client);
  }

  @Post('mfa/start')
  @HttpCode(200)
  @ApiOperation({ summary: 'Begin setting up two-step verification' })
  startMfa(@CurrentUser() me: RequestUser): Promise<MfaEnrollStart> {
    return this.account.startMfa(me);
  }

  @Post('mfa/confirm')
  @HttpCode(200)
  @RateLimit(PER_USER('account-mfa'))
  @ApiOperation({ summary: 'Finish set-up with a first code; returns recovery codes once' })
  async confirmMfa(
    @CurrentUser() me: RequestUser,
    @Body() dto: MfaCodeDto,
    @Client() client: ClientInfo,
  ): Promise<{ recoveryCodes: string[] }> {
    return { recoveryCodes: await this.account.confirmMfa(me, dto.code, client) };
  }

  @Delete('mfa')
  @HttpCode(204)
  @RateLimit(PER_USER('account-mfa'))
  @ApiOperation({ summary: 'Turn off two-step verification (not allowed when required)' })
  async disableMfa(
    @CurrentUser() me: RequestUser,
    @Body() dto: MfaCodeDto,
    @Client() client: ClientInfo,
  ): Promise<void> {
    await this.account.disableMfa(me, dto.code, client);
  }

  @Post('mfa/recovery-codes')
  @HttpCode(200)
  @RateLimit(PER_USER('account-mfa'))
  @ApiOperation({ summary: 'Replace my recovery codes; returns the new ones once' })
  async regenerate(
    @CurrentUser() me: RequestUser,
    @Body() dto: MfaCodeDto,
    @Client() client: ClientInfo,
  ): Promise<{ recoveryCodes: string[] }> {
    return { recoveryCodes: await this.account.regenerateRecoveryCodes(me, dto.code, client) };
  }

  @Delete('sessions/:id')
  @HttpCode(204)
  @ApiOperation({ summary: 'Sign out one of my other sessions' })
  async revokeSession(
    @CurrentUser() me: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Client() client: ClientInfo,
  ): Promise<void> {
    await this.account.revokeSession(me, id, client);
  }
}
