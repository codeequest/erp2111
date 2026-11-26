import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma, User, UserTokenType } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { recordAudit } from '../../common/audit';
import { ClientInfo } from '../../common/client-info';
import { SecurityPolicyService } from '../iam/security-policy.service';
import { hashToken, newToken } from '../iam/tokens';
import { MailService } from '../mail/mail.service';
import { MailTemplate } from '../mail/templates';

type Tx = Prisma.TransactionClient;
type MailUser = Pick<User, 'id' | 'email' | 'firstName'>;

export const INVALID_LINK = 'This link is invalid or has expired.';

const EMAIL_VERIFICATION_HOURS = 48;

const LINKS: Record<UserTokenType, { path: string; template: MailTemplate }> = {
  INVITATION: { path: '/accept-invite', template: 'invitation' },
  PASSWORD_RESET: { path: '/reset-password', template: 'password_reset' },
  EMAIL_VERIFICATION: { path: '/verify-email', template: 'email_verification' },
};

/** Who may use a token of each type. */
function eligible(user: Pick<User, 'status'>, type: UserTokenType): boolean {
  if (type === 'INVITATION') return user.status === 'PENDING';
  if (type === 'PASSWORD_RESET') return user.status === 'ACTIVE';
  return user.status !== 'INACTIVE';
}

function plural(n: number, unit: string): string {
  return `${n} ${unit}${n === 1 ? '' : 's'}`;
}

/** One-time email tokens (invitation, reset, verification). Only SHA-256 hashes are stored. */
@Injectable()
export class AccountTokensService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly policy: SecurityPolicyService,
    private readonly mail: MailService,
    private readonly config: ConfigService,
  ) {}

  private async ttl(type: UserTokenType): Promise<{ ms: number; label: string }> {
    const p = await this.policy.get();
    if (type === 'PASSWORD_RESET') {
      return { ms: p.resetTtlMinutes * 60_000, label: plural(p.resetTtlMinutes, 'minute') };
    }
    const hours = type === 'INVITATION' ? p.invitationTtlHours : EMAIL_VERIFICATION_HOURS;
    return { ms: hours * 3_600_000, label: plural(hours, 'hour') };
  }

  /** Issues a token, voiding earlier unused tokens of the same type. Returns the raw token. */
  async issue(
    userId: string,
    type: UserTokenType,
    createdById: string | null,
    tx: Tx,
  ): Promise<string> {
    const now = new Date();
    await tx.userToken.updateMany({
      where: { userId, type, usedAt: null, expiresAt: { gt: now } },
      data: { expiresAt: now },
    });
    const { token, hash } = newToken();
    const { ms } = await this.ttl(type);
    await tx.userToken.create({
      data: { userId, type, tokenHash: hash, expiresAt: new Date(now.getTime() + ms), createdById },
    });
    return token;
  }

  private async load(token: string, type: UserTokenType, db: Tx | PrismaService) {
    const row = token
      ? await db.userToken.findUnique({ where: { tokenHash: hashToken(token) }, include: { user: true } })
      : null;
    const now = new Date();
    if (!row || row.type !== type || row.usedAt || row.expiresAt <= now || !eligible(row.user, type)) {
      throw new BadRequestException(INVALID_LINK);
    }
    return { row, now };
  }

  /** Validates a token without using it (e.g. to check a password before consuming). */
  async peek(token: string, type: UserTokenType): Promise<User> {
    return (await this.load(token, type, this.prisma)).row.user;
  }

  /** Marks the token used (exactly once, even under concurrency) and returns its user. */
  async consume(token: string, type: UserTokenType, tx: Tx): Promise<User> {
    const { row, now } = await this.load(token, type, tx);
    const res = await tx.userToken.updateMany({
      where: { id: row.id, usedAt: null, expiresAt: { gt: now } },
      data: { usedAt: now },
    });
    if (res.count === 0) throw new BadRequestException(INVALID_LINK);
    return row.user;
  }

  /** Voids every outstanding token of the user (deactivation, etc.). */
  async revokeAll(userId: string, tx: Tx): Promise<void> {
    const now = new Date();
    await tx.userToken.updateMany({
      where: { userId, usedAt: null, expiresAt: { gt: now } },
      data: { expiresAt: now },
    });
  }

  /** Emails the link for an issued token. Never throws (MailService records failures). */
  async mailToken(user: MailUser, type: UserTokenType, token: string): Promise<void> {
    const origin = this.config.get<string>('WEB_ORIGIN', 'http://localhost:3000').replace(/\/$/, '');
    const { path, template } = LINKS[type];
    const { label } = await this.ttl(type);
    await this.mail.send(user.email, template, {
      name: user.firstName,
      link: `${origin}${path}#token=${token}`,
      expiresIn: label,
    });
  }

  private async issueAndMail(
    user: MailUser,
    type: UserTokenType,
    action: string,
    actorId: string | null,
    client: ClientInfo,
  ): Promise<void> {
    const token = await this.prisma.$transaction(async (tx) => {
      const t = await this.issue(user.id, type, actorId, tx);
      await recordAudit(tx, {
        actorId,
        action,
        targetType: 'User',
        targetId: user.id,
        targetLabel: user.email,
        ip: client.ip,
        userAgent: client.userAgent,
      });
      return t;
    });
    await this.mailToken(user, type, token);
  }

  sendInvitation(user: MailUser, actor: { id: string } | null, client: ClientInfo): Promise<void> {
    return this.issueAndMail(user, 'INVITATION', 'user.invitation_sent', actor?.id ?? null, client);
  }

  /** actorId null = self-service "forgot password"; otherwise an admin sent it. */
  sendPasswordReset(user: MailUser, actorId: string | null, client: ClientInfo): Promise<void> {
    return this.issueAndMail(user, 'PASSWORD_RESET', 'user.password_reset_requested', actorId, client);
  }

  sendEmailVerification(user: MailUser, actorId: string | null, client: ClientInfo): Promise<void> {
    return this.issueAndMail(
      user,
      'EMAIL_VERIFICATION',
      'user.email_verification_sent',
      actorId,
      client,
    );
  }
}
