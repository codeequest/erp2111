import { PermissionCode } from '@erp/shared';

/** A loaded, active user with their effective permissions. */
export interface LoadedUser {
  id: string;
  email: string;
  fullName: string;
  roles: string[];
  permissions: Set<PermissionCode>;
}

/** Attached to `request.user` by JwtAuthGuard. */
export interface RequestUser extends LoadedUser {
  /** The server-side session the access token is bound to. */
  sessionId: string;
}

/** Access-token claims. Access tokens never carry `purpose` (challenge tokens always do). */
export interface AccessTokenPayload {
  sub: string;
  email: string;
  sid: string;
}
