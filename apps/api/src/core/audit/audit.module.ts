import { Module } from '@nestjs/common';
import { AccessDeniedRecorder } from './access-denied.recorder';
import { AuditController } from './audit.controller';
import { AuditService } from './audit.service';

@Module({
  controllers: [AuditController],
  providers: [AuditService, AccessDeniedRecorder],
  exports: [AuditService, AccessDeniedRecorder],
})
export class AuditModule {}
