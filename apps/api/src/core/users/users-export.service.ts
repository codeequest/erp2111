import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { recordAudit } from '../../common/audit';
import { ClientInfo } from '../../common/client-info';
import { toCsv } from '../../common/csv';
import { RequestUser } from '../../common/types/request-user';
import { UserExportQueryDto } from './dto/user-query.dto';
import { buildUserWhere } from './user-query';
import { toListItem, USER_LIST_INCLUDE } from './users.service';

const MAX_ROWS = 10_000;
const HEADER = [
  'first_name',
  'last_name',
  'email',
  'username',
  'department',
  'job_title',
  'status',
  'roles',
  'mfa',
  'email_verified',
  'last_login_at',
  'created_at',
];

@Injectable()
export class UsersExportService {
  constructor(private readonly prisma: PrismaService) {}

  /** CSV of the selected users, or of everyone matching the list filters. Audited. */
  async exportCsv(actor: RequestUser, q: UserExportQueryDto, client: ClientInfo): Promise<string> {
    const now = new Date();
    const where = q.ids?.length ? { id: { in: q.ids } } : buildUserWhere(q, now);
    const rows = await this.prisma.user.findMany({
      where,
      include: USER_LIST_INCLUDE,
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }, { id: 'asc' }],
      take: MAX_ROWS,
    });
    await recordAudit(this.prisma, {
      actorId: actor.id,
      action: 'user.exported',
      targetType: 'User',
      after: { count: rows.length, filtered: !q.ids?.length },
      ip: client.ip,
      userAgent: client.userAgent,
    });
    const lines = rows.map((r) => {
      const u = toListItem(r, now);
      return [
        u.firstName,
        u.lastName,
        u.email,
        u.username,
        u.department,
        u.jobTitle,
        u.displayStatus.toLowerCase(),
        u.roles.map((x) => x.name).join('; '),
        u.mfaEnabled ? 'yes' : 'no',
        u.emailVerified ? 'yes' : 'no',
        u.lastLoginAt,
        u.createdAt,
      ];
    });
    return toCsv([HEADER, ...lines]);
  }
}
