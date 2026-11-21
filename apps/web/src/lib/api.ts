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
    public readonly body: ApiError | undefined,
  ) {
    const msg = body?.message;
    super(Array.isArray(msg) ? msg.join(', ') : (msg ?? `Request failed (${status})`));
  }
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

/** Sends the request with the token; on 401 refreshes the session once and retries. */
async function authorizedFetch(path: string, init: RequestInit, retry: boolean): Promise<Response> {
  const headers = new Headers(init.headers);
  // FormData (file uploads) must keep the browser's multipart Content-Type with its boundary.
  const isForm = typeof FormData !== 'undefined' && init.body instanceof FormData;
  if (init.body && !isForm && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  if (accessToken) headers.set('Authorization', `Bearer ${accessToken}`);

  const res = await fetch(`${BASE}${path}`, { ...init, headers, credentials: 'include' });

  if (res.status === 401 && retry && !path.startsWith('/auth/')) {
    const session = await refreshSession();
    if (session) return authorizedFetch(path, init, false);
    onSessionExpired?.();
  }

  if (!res.ok) {
    const body = (await res.json().catch(() => undefined)) as ApiError | undefined;
    throw new ApiRequestError(res.status, body);
  }
  return res;
}

export async function api<T>(path: string, init: RequestInit = {}, retry = true): Promise<T> {
  const res = await authorizedFetch(path, init, retry);
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

/** Downloads a protected file (e.g. a product photo) as a Blob. */
export async function apiBlob(path: string): Promise<Blob> {
  const res = await authorizedFetch(path, {}, true);
  return res.blob();
}
