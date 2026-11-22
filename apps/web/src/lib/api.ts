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

/** Sends the request with auth + one refresh retry; throws ApiRequestError on any non-2xx. */
async function request(path: string, init: RequestInit = {}, retry = true): Promise<Response> {
  const headers = new Headers(init.headers);
  // FormData sets its own multipart Content-Type (with the boundary).
  const isForm = typeof FormData !== 'undefined' && init.body instanceof FormData;
  if (init.body && !isForm && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  if (accessToken) headers.set('Authorization', `Bearer ${accessToken}`);

  const res = await fetch(`${BASE}${path}`, { ...init, headers, credentials: 'include' });

  if (res.status === 401 && retry && !path.startsWith('/auth/')) {
    const session = await refreshSession();
    if (session) return request(path, init, false);
    onSessionExpired?.();
  }

  if (!res.ok) {
    const body = (await res.json().catch(() => undefined)) as ApiError | undefined;
    throw new ApiRequestError(res.status, body);
  }
  return res;
}

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await request(path, init);
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

/** For binary responses: images, CSV files. */
export async function apiBlob(path: string, init: RequestInit = {}): Promise<Blob> {
  return (await request(path, init)).blob();
}

/** Downloads a file from the API (the token is in memory, so a plain <a href> would not be authorised). */
export async function downloadFile(path: string, fallbackName: string): Promise<void> {
  const res = await request(path);
  const disposition = res.headers.get('Content-Disposition') ?? '';
  const name = /filename="([^"]+)"/.exec(disposition)?.[1] ?? fallbackName;
  const url = URL.createObjectURL(await res.blob());
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
