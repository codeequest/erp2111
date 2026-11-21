'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { AuthResponse, AuthUser, PermissionCode } from '@erp/shared';
import { api, refreshSession, setAccessToken, setSessionExpiredHandler } from './api';

type Status = 'loading' | 'authenticated' | 'anonymous';

interface AuthContextValue {
  status: Status;
  user: AuthUser | null;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  /** UI convenience only — the API enforces permissions on every request. */
  can: (permission: PermissionCode) => boolean;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<Status>('loading');
  const [user, setUser] = useState<AuthUser | null>(null);

  const applySession = useCallback((session: AuthResponse | null) => {
    setAccessToken(session?.accessToken ?? null);
    setUser(session?.user ?? null);
    setStatus(session ? 'authenticated' : 'anonymous');
  }, []);

  // Restore the session from the refresh cookie on page load.
  useEffect(() => {
    setSessionExpiredHandler(() => applySession(null));
    refreshSession().then(applySession);
    return () => setSessionExpiredHandler(null);
  }, [applySession]);

  const login = useCallback(
    async (email: string, password: string) => {
      const session = await api<AuthResponse>('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      });
      applySession(session);
    },
    [applySession],
  );

  const logout = useCallback(async () => {
    await api('/auth/logout', { method: 'POST' }).catch(() => undefined);
    applySession(null);
  }, [applySession]);

  const value = useMemo<AuthContextValue>(() => {
    const permissions = new Set(user?.permissions ?? []);
    return { status, user, login, logout, can: (p) => permissions.has(p) };
  }, [status, user, login, logout]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
