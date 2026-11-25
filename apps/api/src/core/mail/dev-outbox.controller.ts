import { Controller, Get } from '@nestjs/common';
import { Public } from '../../common/decorators/public.decorator';
import { PrismaService } from '../../prisma/prisma.service';

/** Dev-only: registered by MailModule.register() only when MAIL_TRANSPORT=outbox and not production. */
@Controller('dev/outbox')
export class DevOutboxController {
  constructor(private readonly prisma: PrismaService) {}

  @Public()
  @Get()
  list() {
    return this.prisma.emailOutbox.findMany({ orderBy: { createdAt: 'desc' }, take: 50 });
  }
}
