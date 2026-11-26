import type { ApiError, AuthResponse } from '@erp/shared';

/**
 * Small fetch wrapper for the ERP API.
 *  - adds the access token (kept in memory only, never in localStorage)
 *  - on 401, refreshes the session once with the httpOnly cookie, then retries
 */
const BASE = '/api/v1';

let accessToken: string | null = null;
let refreshInFlight: Promise<AuthResponse | null> | null = null;
let onSessionExpired: (() => void) | null = null;

export function setAccessToken(token: string | null) {
  accessToken = token;
}

export function setSessionExpiredHandler(handler: (() => void) | null) {
  onSessionExpired = handler;
}

export class ApiRequestError extends Error {
  constructor(
    public readonly status: number,
    public readonly body: (ApiError & { code?: string }) | undefined,
  ) {
    const msg = body?.message;
    super(Array.isArray(msg) ? msg.join(', ') : (msg ?? `Request failed (${status})`));
  }

  /** Policy code from the API (e.g. LAST_ADMIN, ESCALATION, SELF_LOCKOUT). */
  get code(): string | undefined {
    return this.body?.code;
  }

  /** Every message as a list (validation errors come as an array). */
  get messages(): string[] {
    const msg = this.body?.message;
    return Array.isArray(msg) ? msg : [this.message];
  }
}

/** Human message for any thrown value. */
export function errorMessage(e: unknown, fallback = 'Something went wrong. Please try again.') {
  if (e instanceof ApiRequestError) return e.message;
  return fallback;
}

/** Shared by all callers so parallel 401s trigger only one refresh. */
export function refreshSession(): Promise<AuthResponse | null> {
  refreshInFlight ??= fetch(`${BASE}/auth/refresh`, { method: 'POST', credentials: 'include' })
    .then(async (res) => {
      if (!res.ok) return null;
      const data = (await res.json()) as AuthResponse;
      setAccessToken(data.accessToken);
      return data;
    })
    .catch(() => null)
    .finally(() => {
      refreshInFlight = null;
    });
  return refreshInFlight;
}

export async function api<T>(path: string, init: RequestInit = {}, retry = true): Promise<T> {
  const headers = new Headers(init.headers);
  // FormData sets its own multipart Content-Type (with the boundary).
  if (init.body && !(init.body instanceof FormData) && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  if (accessToken) headers.set('Authorization', `Bearer ${accessToken}`);

  const res = await fetch(`${BASE}${path}`, { ...init, headers, credentials: 'include' });

  if (res.status === 401 && retry && !path.startsWith('/auth/')) {
    const session = await refreshSession();
    if (session) return api<T>(path, init, false);
    onSessionExpired?.();
  }

  if (!res.ok) {
    const body = (await res.json().catch(() => undefined)) as ApiError | undefined;
    throw new ApiRequestError(res.status, body);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

/**
 * Downloads a file from the API (with the access token) and saves it in the browser.
 * Plain links cannot be used because the token is never stored in a cookie.
 */
export async function apiDownload(path: string, fallbackName: string, retry = true): Promise<void> {
  const headers = new Headers();
  if (accessToken) headers.set('Authorization', `Bearer ${accessToken}`);
  const res = await fetch(`${BASE}${path}`, { headers, credentials: 'include' });
  if (res.status === 401 && retry) {
    if (await refreshSession()) return apiDownload(path, fallbackName, false);
    onSessionExpired?.();
  }
  if (!res.ok) {
    const body = (await res.json().catch(() => undefined)) as ApiError | undefined;
    throw new ApiRequestError(res.status, body);
  }
  const name =
    /filename="?([^";]+)"?/.exec(res.headers.get('Content-Disposition') ?? '')?.[1] ?? fallbackName;
  const url = URL.createObjectURL(await res.blob());
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
