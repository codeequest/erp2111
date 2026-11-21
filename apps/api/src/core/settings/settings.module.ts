import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { InventoryModule } from '../../modules/inventory/inventory.module';
import { SettingsController } from './settings.controller';
import { SettingsService } from './settings.service';

@Module({
  // InventoryModule provides ProductCodeService (real next product code, skipping codes in use).
  imports: [AuditModule, InventoryModule],
  controllers: [SettingsController],
  providers: [SettingsService],
  exports: [SettingsService],
})
export class SettingsModule {}
