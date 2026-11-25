import { AuthResponse } from './auth';
import { ErpModuleKey, PermissionDefinition } from './permissions';
import { RoleColor, RoleType } from './roles';

/** Types shared by the IAM administration API and web screens (spec §8, §10, §11). */

export type UserStatus = 'PENDING' | 'ACTIVE' | 'INACTIVE';
/** LOCKED is derived from `lockedUntil > now`, never stored. */
export type DisplayStatus = UserStatus | 'LOCKED';

export const PAGE_SIZES = [10, 25, 50, 100] as const;
export type PageSize = (typeof PAGE_SIZES)[number];

export interface Page<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface RoleRef {
  id: string;
  name: string;
  color: RoleColor;
}

export interface UserRoleAssignment {
  role: RoleRef;
  assignedAt: string;
  assignedBy: string | null;
  expiresAt: string | null;
}

export interface UserListItem {
  id: string;
  email: string;
  username: string | null;
  firstName: string;
  lastName: string;
  fullName: string;
  department: string | null;
  jobTitle: string | null;
  status: UserStatus;
  displayStatus: DisplayStatus;
  roles: RoleRef[];
  mfaEnabled: boolean;
  emailVerified: boolean;
  lastLoginAt: string | null;
  createdAt: string;
}

export interface UserDetail extends UserListItem {
  phone: string | null;
  employeeId: string | null;
  metadata: Record<string, string>;
  assignments: UserRoleAssignment[];
  mfaRequired: boolean;
  mustChangePassword: boolean;
  passwordChangedAt: string | null;
  emailVerifiedAt: string | null;
  failedLoginCount: number;
  lockedUntil: string | null;
  deactivatedAt: string | null;
  deactivatedBy: string | null;
  deactivationReason: string | null;
  accessReviewedAt: string | null;
  accessReviewedBy: string | null;
  hasPendingInvitation: boolean;
  updatedAt: string;
}

export interface UserListQuery {
  search?: string;
  status?: DisplayStatus;
  roleIds?: string[];
  mfa?: boolean;
  verified?: boolean;
  department?: string;
  createdFrom?: string;
  createdTo?: string;
  lastLoginFrom?: string;
  lastLoginTo?: string;
  neverLoggedIn?: boolean;
  sort?: string;
  order?: 'asc' | 'desc';
  page?: number;
  pageSize?: PageSize;
}

export interface UserStats {
  total: number;
  active: number;
  pending: number;
  inactive: number;
  locked: number;
  withoutMfa: number;
}

export interface EffectivePermission {
  code: string;
  label: string;
  module: ErpModuleKey;
  sensitive: boolean;
  /** Roles that grant this permission. */
  sources: RoleRef[];
}

export interface SessionInfo {
  id: string;
  createdAt: string;
  lastSeenAt: string;
  expiresAt: string;
  ip: string | null;
  userAgent: string | null;
  /** True for the session making the request. */
  current: boolean;
}

export type BulkUserAction = 'activate' | 'deactivate' | 'assignRoles' | 'removeRoles';

export interface BulkUserRequest {
  action: BulkUserAction;
  /** At most 200. */
  userIds: string[];
  roleIds?: string[];
  reason?: string;
}

export interface BulkUserResultItem {
  userId: string;
  result: 'updated' | 'skipped' | 'failed';
  reason?: string;
}

export interface BulkUserResult {
  results: BulkUserResultItem[];
}

export interface RoleListItem {
  id: string;
  name: string;
  description: string;
  type: RoleType;
  isProtected: boolean;
  color: RoleColor;
  category: string | null;
  userCount: number;
  permissionCount: number;
  privileged: boolean;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface RoleDetail extends RoleListItem {
  permissions: string[];
  users: { id: string; fullName: string; email: string }[];
}

export interface RoleInput {
  name: string;
  description: string;
  color: RoleColor;
  category?: string | null;
  permissions: string[];
  /** Required on update (optimistic locking). */
  version?: number;
  cloneFromId?: string;
  templateKey?: string;
}

export interface RoleImpact {
  added: string[];
  removed: string[];
  sensitiveAdded: string[];
  sensitiveRemoved: string[];
  affectedUsers: { id: string; fullName: string; email: string }[];
}

export interface PermissionMatrix {
  modules: { key: ErpModuleKey; label: string; permissions: PermissionDefinition[] }[];
  roles: (RoleRef & {
    type: RoleType;
    isProtected: boolean;
    version: number;
    permissions: string[];
  })[];
}

export interface MatrixSaveRequest {
  roles: { id: string; version: number; permissions: string[] }[];
}

export type AuditResult = 'SUCCESS' | 'FAILURE' | 'DENIED';

export interface AuditEntryDto {
  id: string;
  createdAt: string;
  action: string;
  result: AuditResult;
  actorId: string | null;
  actorName: string | null;
  entity: string;
  entityId: string | null;
  targetLabel: string | null;
  before: unknown;
  after: unknown;
  reason: string | null;
  ip: string | null;
  userAgent: string | null;
}

export interface AuditQuery {
  actorId?: string;
  targetType?: string;
  targetId?: string;
  action?: string;
  result?: AuditResult;
  from?: string;
  to?: string;
  search?: string;
  page?: number;
  pageSize?: PageSize;
}

export interface SecurityPolicyDto {
  passwordMinLength: number;
  passwordMaxLength: number;
  blockBreachedPasswords: boolean;
  breachApiCheck: boolean;
  lockoutThreshold: number;
  lockoutMinutes: number;
  invitationTtlHours: number;
  resetTtlMinutes: number;
  requireMfaForPrivileged: boolean;
  accessReviewDays: number;
  dormantDays: number;
  revokeSessionsOnPasswordReset: boolean;
}

export interface SecurityOverview {
  totalUsers: number;
  activeUsers: number;
  withoutMfa: number;
  privilegedUsers: number;
  pendingInvitations: number;
  lockedAccounts: number;
  neverLoggedIn: number;
  dormant: number;
  overdueAccessReviews: number;
  recentActivity: AuditEntryDto[];
}

export type LoginChallengeKind = 'password_change' | 'mfa_enroll' | 'mfa';

export type LoginResult =
  | ({ kind: 'session' } & AuthResponse)
  | { kind: 'challenge'; challenge: LoginChallengeKind; challengeToken: string };

export interface MfaEnrollStart {
  otpauthUri: string;
  qrDataUrl: string;
  secret: string;
}

export interface PasswordPolicyHints {
  minLength: number;
  maxLength: number;
}
