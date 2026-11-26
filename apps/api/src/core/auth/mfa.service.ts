import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import * as argon2 from 'argon2';
import * as QRCode from 'qrcode';
import { MfaEnrollStart } from '@erp/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { recordAudit } from '../../common/audit';
import { ClientInfo } from '../../common/client-info';
import { open, seal } from '../iam/secret-box';
import { generateRecoveryCodes, generateTotpSecret, otpauthUri, verifyTotp } from '../iam/totp';

type Tx = Prisma.TransactionClient;

export interface MfaInput {
  code?: string;
  recoveryCode?: string;
}

const BAD_CODE = 'That code is not valid. Check the time on your device and try again.';

/** TOTP enrolment / verification and recovery codes. Secrets are sealed with MFA_ENCRYPTION_KEY. */
@Injectable()
export class MfaService {
  private readonly logger = new Logger(MfaService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  private key(): string {
    return this.config.getOrThrow<string>('MFA_ENCRYPTION_KEY');
  }

  async isEnabled(userId: string): Promise<boolean> {
    const m = await this.prisma.userMfa.findUnique({ where: { userId } });
    return !!m?.enabledAt;
  }

  async recoveryCodesLeft(userId: string): Promise<number> {
    return this.prisma.mfaRecoveryCode.count({ where: { userId, usedAt: null } });
  }

  /** Creates (or restarts) a pending enrolment. The secret is returned only here. */
  async startEnrollment(userId: string): Promise<MfaEnrollStart> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { mfa: true },
    });
    if (!user) throw new NotFoundException('User not found');
    if (user.mfa?.enabledAt) throw new ConflictException('Two-step verification is already on.');

    const secret = generateTotpSecret();
    const secretEnc = seal(secret, this.key());
    await this.prisma.userMfa.upsert({
      where: { userId },
      create: { userId, secretEnc },
      update: { secretEnc, enabledAt: null, lastUsedStep: null },
    });
    const company = await this.prisma.companySettings.findUnique({ where: { id: 1 } });
    const uri = otpauthUri(secret, user.email, company?.name ?? 'ERP');
    const qrDataUrl = await QRCode.toDataURL(uri, { margin: 1, width: 240 });
    return { otpauthUri: uri, qrDataUrl, secret };
  }

  /** Confirms a pending enrolment with a first code; returns 10 recovery codes (shown once). */
  async confirmEnrollment(userId: string, code: string, client: ClientInfo = {}): Promise<string[]> {
    const m = await this.prisma.userMfa.findUnique({ where: { userId } });
    if (!m || m.enabledAt) {
      throw new BadRequestException('Start setting up two-step verification first.');
    }
    const step = verifyTotp(open(m.secretEnc, this.key()), code.trim(), Date.now(), null);
    if (step === null) throw new BadRequestException(BAD_CODE);

    const codes = generateRecoveryCodes();
    const hashes = await Promise.all(codes.map((c) => argon2.hash(c)));
    await this.prisma.$transaction(async (tx) => {
      const res = await tx.userMfa.updateMany({
        where: { userId, enabledAt: null },
        data: { enabledAt: new Date(), lastUsedStep: step },
      });
      if (res.count === 0) throw new ConflictException('Two-step verification is already on.');
      await this.replaceRecoveryCodes(tx, userId, hashes);
      await recordAudit(tx, {
        actorId: userId,
        action: 'user.mfa_enabled',
        targetType: 'User',
        targetId: userId,
        ip: client.ip,
        userAgent: client.userAgent,
      });
    });
    return codes;
  }

  /** True when the TOTP code (not replayed) or an unused recovery code is valid. */
  async verify(userId: string, input: MfaInput): Promise<boolean> {
    const m = await this.prisma.userMfa.findUnique({ where: { userId } });
    if (!m?.enabledAt) return false;

    if (input.code) {
      let secret: string;
      try {
        secret = open(m.secretEnc, this.key());
      } catch (e) {
        this.logger.error(`Cannot decrypt MFA secret of user ${userId}: ${(e as Error).message}`);
        return false;
      }
      let step: number | null;
      try {
        step = verifyTotp(secret, input.code.trim(), Date.now(), m.lastUsedStep);
      } catch {
        return false;
      }
      if (step === null) return false;
      // Conditional: a concurrent use of the same code loses.
      const res = await this.prisma.userMfa.updateMany({
        where: { userId, OR: [{ lastUsedStep: null }, { lastUsedStep: { lt: step } }] },
        data: { lastUsedStep: step },
      });
      return res.count > 0;
    }

    if (input.recoveryCode) {
      const normalized = input.recoveryCode.trim().toLowerCase();
      if (!/^[a-z2-7]{5}-[a-z2-7]{5}$/.test(normalized)) return false;
      const rows = await this.prisma.mfaRecoveryCode.findMany({ where: { userId, usedAt: null } });
      for (const r of rows) {
        if (await argon2.verify(r.codeHash, normalized)) {
          const res = await this.prisma.mfaRecoveryCode.updateMany({
            where: { id: r.id, usedAt: null },
            data: { usedAt: new Date() },
          });
          return res.count > 0;
        }
      }
    }
    return false;
  }

  /** Removes MFA and its recovery codes (caller audits). */
  async disable(userId: string, tx: Tx): Promise<void> {
    await tx.mfaRecoveryCode.deleteMany({ where: { userId } });
    await tx.userMfa.deleteMany({ where: { userId } });
  }

  async regenerateRecoveryCodes(userId: string, client: ClientInfo = {}): Promise<string[]> {
    if (!(await this.isEnabled(userId))) {
      throw new BadRequestException('Two-step verification is not on.');
    }
    const codes = generateRecoveryCodes();
    const hashes = await Promise.all(codes.map((c) => argon2.hash(c)));
    await this.prisma.$transaction(async (tx) => {
      await this.replaceRecoveryCodes(tx, userId, hashes);
      await recordAudit(tx, {
        actorId: userId,
        action: 'user.mfa_recovery_codes_regenerated',
        targetType: 'User',
        targetId: userId,
        ip: client.ip,
        userAgent: client.userAgent,
      });
    });
    return codes;
  }

  private async replaceRecoveryCodes(tx: Tx, userId: string, hashes: string[]) {
    await tx.mfaRecoveryCode.deleteMany({ where: { userId } });
    await tx.mfaRecoveryCode.createMany({
      data: hashes.map((codeHash) => ({ userId, codeHash })),
    });
  }
}
