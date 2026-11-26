import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createTransport, Transporter } from 'nodemailer';
import { PrismaService } from '../../prisma/prisma.service';
import { isDevOutbox } from './mail-config';
import { MailTemplate, render } from './templates';

export interface SendVars {
  name: string;
  link?: string;
  expiresIn?: string;
}

@Injectable()
export class MailService implements OnModuleInit {
  private readonly logger = new Logger(MailService.name);
  private transport: Pick<Transporter, 'sendMail'> | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  /** smtp: really send. outbox: dev only, store body. none: record metadata only, deliver nothing. */
  private get mode(): 'outbox' | 'smtp' | 'none' {
    const transport = this.config.get<string>('MAIL_TRANSPORT');
    if (transport === 'smtp') return 'smtp';
    const dev = isDevOutbox({
      MAIL_TRANSPORT: transport,
      NODE_ENV: this.config.get<string>('NODE_ENV'),
    });
    return dev ? 'outbox' : 'none';
  }

  onModuleInit(): void {
    const transport = this.config.get<string>('MAIL_TRANSPORT');
    if (transport === 'smtp') {
      if (!this.config.get<string>('SMTP_HOST')) {
        this.logger.warn('MAIL_TRANSPORT=smtp but SMTP_HOST is empty; emails will fail to send.');
      }
    } else if (this.mode === 'none') {
      this.logger.warn(
        'No mail transport configured (MAIL_TRANSPORT); emails are recorded without content and not delivered.',
      );
    }
  }

  private getTransport(): Pick<Transporter, 'sendMail'> {
    if (!this.transport) {
      const user = this.config.get<string>('SMTP_USER');
      this.transport = createTransport({
        host: this.config.get<string>('SMTP_HOST'),
        port: Number(this.config.get<string>('SMTP_PORT', '587')),
        secure: this.config.get<string>('SMTP_SECURE', 'false') === 'true',
        auth: user ? { user, pass: this.config.get<string>('SMTP_PASSWORD') } : undefined,
      });
    }
    return this.transport;
  }

  private async companyName(): Promise<string> {
    try {
      const row = await this.prisma.companySettings.findUnique({ where: { id: 1 } });
      return row?.name || 'ERP';
    } catch {
      return 'ERP';
    }
  }

  /** Never throws: failures are recorded on the outbox row (or logged) without the body. */
  async send(to: string, template: MailTemplate, vars: SendVars): Promise<void> {
    let rowId: string | null = null;
    let delivered = false;
    try {
      const company = await this.companyName();
      const mail = render(template, { company, ...vars });
      const mode = this.mode;
      const row = await this.prisma.emailOutbox.create({
        data: {
          to,
          template,
          subject: mail.subject,
          status: 'QUEUED',
          body: mode === 'outbox' ? mail.html : null,
        },
      });
      rowId = row.id;
      if (mode === 'smtp') {
        await this.getTransport().sendMail({
          from: this.config.get<string>('MAIL_FROM', 'ERP <no-reply@localhost>'),
          to,
          subject: mail.subject,
          html: mail.html,
          text: mail.text,
        });
      }
      delivered = true;
      await this.prisma.emailOutbox.update({
        where: { id: rowId },
        data: { status: 'SENT', sentAt: new Date() },
      });
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      if (delivered) {
        // Mail went out; only the bookkeeping failed. Don't mark it FAILED.
        this.logger.warn(`Email "${template}" was sent but its outbox row could not be updated: ${message}`);
        return;
      }
      this.logger.error(`Failed to send "${template}" email: ${message}`);
      if (rowId) {
        try {
          await this.prisma.emailOutbox.update({
            where: { id: rowId },
            data: { status: 'FAILED', error: message.slice(0, 500) },
          });
        } catch {
          /* already logged */
        }
      }
    }
  }
}
