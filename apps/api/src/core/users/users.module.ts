import { Module } from '@nestjs/common';
import { UserLifecycleService } from './user-lifecycle.service';
import { UserRolesService } from './user-roles.service';
import { UsersBulkService } from './users-bulk.service';
import { UsersController } from './users.controller';
import { UsersExportService } from './users-export.service';
import { UsersService } from './users.service';

@Module({
  controllers: [UsersController],
  providers: [
    UsersService,
    UserLifecycleService,
    UserRolesService,
    UsersBulkService,
    UsersExportService,
  ],
  exports: [UsersService, UserRolesService],
})
export class UsersModule {}
