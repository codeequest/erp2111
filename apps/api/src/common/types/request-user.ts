import { PermissionCode } from '@erp/shared';

/** Attached to `request.user` by JwtAuthGuard. */
export interface RequestUser {
  id: string;
  email: string;
  fullName: string;
  roles: string[];
  permissions: Set<PermissionCode>;
}

export interface AccessTokenPayload {
  sub: string;
  email: string;
}
