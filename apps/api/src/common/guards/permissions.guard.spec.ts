import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PermissionCode } from '@erp/shared';
import { PermissionsGuard } from './permissions.guard';
import { RequestUser } from '../types/request-user';

function contextFor(user: Partial<RequestUser> | undefined): ExecutionContext {
  return {
    getHandler: () => undefined,
    getClass: () => undefined,
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
  } as unknown as ExecutionContext;
}

function guardRequiring(perms: PermissionCode[] | undefined) {
  const reflector = { getAllAndOverride: () => perms } as unknown as Reflector;
  return new PermissionsGuard(reflector);
}

const userWith = (...perms: PermissionCode[]) => ({ permissions: new Set(perms) });

describe('PermissionsGuard', () => {
  it('allows routes without @RequirePermissions', () => {
    expect(guardRequiring(undefined).canActivate(contextFor(userWith()))).toBe(true);
  });

  it('allows a user holding the required permission', () => {
    const guard = guardRequiring(['sales.order.confirm']);
    expect(guard.canActivate(contextFor(userWith('sales.order.confirm')))).toBe(true);
  });

  it('rejects a user missing the permission with 403', () => {
    const guard = guardRequiring(['sales.order.confirm']);
    expect(() => guard.canActivate(contextFor(userWith('sales.order.read')))).toThrow(
      ForbiddenException,
    );
  });

  it('requires ALL listed permissions', () => {
    const guard = guardRequiring(['sales.order.read', 'inventory.cost.view']);
    expect(() => guard.canActivate(contextFor(userWith('sales.order.read')))).toThrow(
      ForbiddenException,
    );
  });

  it('rejects when there is no user on the request', () => {
    const guard = guardRequiring(['dashboard.summary.view']);
    expect(() => guard.canActivate(contextFor(undefined))).toThrow(ForbiddenException);
  });
});
