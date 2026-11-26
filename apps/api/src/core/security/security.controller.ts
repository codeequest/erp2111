import { BadRequestException, Body, Controller, Get, Patch } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { SecurityOverview, SecurityPolicyDto } from '@erp/shared';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Client, ClientInfo } from '../../common/client-info';
import { RequestUser } from '../../common/types/request-user';
import { SecurityPolicyService } from '../iam/security-policy.service';
import { UpdatePolicyDto } from './dto/policy.dto';
import { SecurityOverviewService } from './security-overview.service';

@ApiTags('Admin · Security')
@Controller('security')
export class SecurityController {
  constructor(
    private readonly overviewService: SecurityOverviewService,
    private readonly policy: SecurityPolicyService,
  ) {}

  @Get('overview')
  @RequirePermissions('admin.security.view')
  @ApiOperation({ summary: 'Security health: risky accounts and recent admin activity' })
  overview(): Promise<SecurityOverview> {
    return this.overviewService.overview();
  }

  @Get('policy')
  @RequirePermissions('admin.security.view')
  @ApiOperation({ summary: 'Password, lockout, link and MFA rules' })
  getPolicy(): Promise<SecurityPolicyDto> {
    return this.policy.get();
  }

  @Patch('policy')
  @RequirePermissions('admin.security.manage')
  @ApiOperation({ summary: 'Change the security policy (audited)' })
  async updatePolicy(
    @Body() dto: UpdatePolicyDto,
    @CurrentUser() actor: RequestUser,
    @Client() client: ClientInfo,
  ): Promise<SecurityPolicyDto> {
    const current = await this.policy.get();
    const merged: SecurityPolicyDto = { ...current };
    for (const [k, v] of Object.entries(dto)) {
      if (v !== undefined) (merged as unknown as Record<string, unknown>)[k] = v;
    }
    if (merged.passwordMaxLength < merged.passwordMinLength) {
      throw new BadRequestException({
        statusCode: 400,
        message: ['The maximum length must be at least the minimum length.'],
        error: 'Bad Request',
      });
    }
    return this.policy.update(merged, actor, client);
  }
}
