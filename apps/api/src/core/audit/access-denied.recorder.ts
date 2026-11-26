import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { recordAudit } from '../../common/audit';
import { extractClientInfo } from '../../common/client-info';
import type { Request } from 'express';

/** Admin areas where a refused request is worth an audit entry. */
const WATCHED = /^\/api\/v1\/(users|roles|permissions|security|audit-logs)(\/|\?|$)/;

/** Records `access.denied` for refused admin requests. Fire-and-forget: never blocks the 403. */
@Injectable()
export class AccessDeniedRecorder {
  private readonly logger = new Logger(AccessDeniedRecorder.name);

  constructor(private readonly prisma: PrismaService) {}

  record(req: Request & { user?: { id: string } }, missing: string[]): void {
    const path = req.originalUrl ?? req.url;
    if (!WATCHED.test(path)) return;
    const client = extractClientInfo(req);
    recordAudit(this.prisma, {
      actorId: req.user?.id ?? null,
      action: 'access.denied',
      targetType: 'Route',
      targetLabel: `${req.method} ${path.split('?')[0]}`.slice(0, 200),
      result: 'DENIED',
      reason: `Missing permission: ${missing.join(', ')}`,
      ip: client.ip,
      userAgent: client.userAgent,
    }).catch((e: Error) => this.logger.warn(`Could not record denied access: ${e.message}`));
  }
}
