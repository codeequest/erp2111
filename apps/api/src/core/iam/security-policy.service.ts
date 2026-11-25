import { Injectable } from '@nestjs/common';
import { SecurityPolicyDto } from '@erp/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { recordAudit } from '../../common/audit';
import { ClientInfo } from '../../common/client-info';
import { RequestUser } from '../../common/types/request-user';

const TTL_MS = 30_000;

const FIELDS: (keyof SecurityPolicyDto)[] = [
  'passwordMinLength',
  'passwordMaxLength',
  'blockBreachedPasswords',
  'breachApiCheck',
  'lockoutThreshold',
  'lockoutMinutes',
  'invitationTtlHours',
  'resetTtlMinutes',
  'requireMfaForPrivileged',
  'accessReviewDays',
  'dormantDays',
  'revokeSessionsOnPasswordReset',
];

function toDto(row: object): SecurityPolicyDto {
  const src = row as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const f of FIELDS) out[f] = src[f];
  return out as unknown as SecurityPolicyDto;
}

@Injectable()
export class SecurityPolicyService {
  private cache: { value: SecurityPolicyDto; at: number } | null = null;

  constructor(private readonly prisma: PrismaService) {}

  async get(): Promise<SecurityPolicyDto> {
    if (this.cache && Date.now() - this.cache.at < TTL_MS) return this.cache.value;
    const row = await this.prisma.securityPolicy.upsert({
      where: { id: 1 },
      update: {},
      create: { id: 1 },
    });
    const value = toDto(row);
    this.cache = { value, at: Date.now() };
    return value;
  }

  async update(
    dto: SecurityPolicyDto,
    actor: RequestUser,
    client: ClientInfo,
  ): Promise<SecurityPolicyDto> {
    const data = toDto(dto);
    const result = await this.prisma.$transaction(async (tx) => {
      const beforeRow = await tx.securityPolicy.upsert({
        where: { id: 1 },
        update: {},
        create: { id: 1 },
      });
      const row = await tx.securityPolicy.update({ where: { id: 1 }, data });
      await recordAudit(tx, {
        actorId: actor.id,
        action: 'security.policy_updated',
        targetType: 'SecurityPolicy',
        targetId: '1',
        before: toDto(beforeRow),
        after: toDto(row),
        ip: client.ip ?? null,
        userAgent: client.userAgent ?? null,
      });
      return toDto(row);
    });
    this.cache = null;
    return result;
  }
}
