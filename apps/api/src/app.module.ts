import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { PermissionsGuard } from './common/guards/permissions.guard';
import { RateLimitGuard } from './common/rate-limit/rate-limit.guard';
import { PolicyViolationFilter } from './common/policy-violation.filter';
import { IamModule } from './core/iam/iam.module';
import { PrismaModule } from './prisma/prisma.module';
import { HealthModule } from './health/health.module';
// Core
import { AuthModule } from './core/auth/auth.module';
import { UsersModule } from './core/users/users.module';
import { RolesModule } from './core/roles/roles.module';
import { SettingsModule } from './core/settings/settings.module';
import { AuditModule } from './core/audit/audit.module';
// Business modules
import { DashboardModule } from './modules/dashboard/dashboard.module';
import { InventoryModule } from './modules/inventory/inventory.module';
import { PurchasingModule } from './modules/purchasing/purchasing.module';
import { SalesModule } from './modules/sales/sales.module';
import { InvoicingModule } from './modules/invoicing/invoicing.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    IamModule,
    HealthModule,
    AuthModule,
    UsersModule,
    RolesModule,
    SettingsModule,
    AuditModule,
    DashboardModule,
    InventoryModule,
    PurchasingModule,
    SalesModule,
    InvoicingModule,
  ],
  providers: [
    // Order matters: authenticate first, then check permissions.
    // Every route is protected unless marked @Public().
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: PermissionsGuard },
    // Applies to @Public routes too (JwtAuthGuard lets them through).
    { provide: APP_GUARD, useClass: RateLimitGuard },
    { provide: APP_FILTER, useClass: PolicyViolationFilter },
  ],
})
export class AppModule {}
