import { PermissionCode } from './permissions';

/** The user as returned by GET /api/v1/auth/me and by login / refresh. */
export interface AuthUser {
  id: string;
  email: string;
  fullName: string;
  roles: string[];
  permissions: PermissionCode[];
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface AuthResponse {
  accessToken: string;
  user: AuthUser;
}

/** Standard error body returned by the API. */
export interface ApiError {
  statusCode: number;
  message: string | string[];
  error?: string;
}
