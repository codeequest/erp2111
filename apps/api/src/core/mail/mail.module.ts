import { DynamicModule, Global, Module } from '@nestjs/common';
import { DevOutboxController } from './dev-outbox.controller';
import { MailService } from './mail.service';

@Global()
@Module({})
export class MailModule {
  /** Call after ConfigModule.forRoot() so .env values are already in process.env. */
  static register(): DynamicModule {
    const devOutbox =
      (process.env.MAIL_TRANSPORT ?? 'outbox') === 'outbox' &&
      process.env.NODE_ENV !== 'production';
    return {
      module: MailModule,
      providers: [MailService],
      exports: [MailService],
      controllers: devOutbox ? [DevOutboxController] : [],
    };
  }
}
