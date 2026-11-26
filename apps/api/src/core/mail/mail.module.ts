import { DynamicModule, Global, Module } from '@nestjs/common';
import { DevOutboxController } from './dev-outbox.controller';
import { isDevOutbox } from './mail-config';
import { MailService } from './mail.service';

@Global()
@Module({})
export class MailModule {
  /** Call after ConfigModule.forRoot() so .env values are already in process.env. */
  static register(): DynamicModule {
    const devOutbox = isDevOutbox();
    return {
      module: MailModule,
      providers: [MailService],
      exports: [MailService],
      controllers: devOutbox ? [DevOutboxController] : [],
    };
  }
}
