import { Module } from '@nestjs/common';
import { SecurityController } from './security.controller';
import { SecurityOverviewService } from './security-overview.service';

@Module({
  controllers: [SecurityController],
  providers: [SecurityOverviewService],
})
export class SecurityModule {}
