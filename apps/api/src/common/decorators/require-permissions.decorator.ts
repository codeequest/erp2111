import { applyDecorators, SetMetadata } from '@nestjs/common';
import { ApiBearerAuth, ApiForbiddenResponse } from '@nestjs/swagger';
import { PermissionCode } from '@erp/shared';

export const PERMISSIONS_KEY = 'requiredPermissions';

/**
 * The logged-in user must hold ALL listed permissions, otherwise the API answers 403.
 *
 * @example
 *   @RequirePermissions('sales.order.confirm')
 *   @Post(':id/confirm')
 *   confirm(@Param('id') id: string) { ... }
 */
export const RequirePermissions = (...permissions: PermissionCode[]) =>
  applyDecorators(
    SetMetadata(PERMISSIONS_KEY, permissions),
    ApiBearerAuth(),
    ApiForbiddenResponse({ description: `Requires: ${permissions.join(', ')}` }),
  );
