import { Module } from '@nestjs/common';
import { MatrixService } from './matrix.service';
import { PermissionsController } from './permissions.controller';
import { RolesController } from './roles.controller';
import { RolesService } from './roles.service';

@Module({
  controllers: [RolesController, PermissionsController],
  providers: [RolesService, MatrixService],
  exports: [RolesService],
})
export class RolesModule {}
