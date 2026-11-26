'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { AuthResponse, AuthUser, LoginResult, PermissionCode } from '@erp/shared';
import { api, refreshSession, setAccessToken, setSessionExpiredHandler } from './api';

type Status = 'loading' | 'authenticated' | 'anonymous';

interface AuthContextValue {
  status: Status;
  user: AuthUser | null;
  /**
   * Starts a login. A `session` result is applied right away; a `challenge`
   * (password change, MFA code, MFA set-up) is returned for the page to continue.
   */
  login: (email: string, password: string) => Promise<LoginResult>;
  /** Applies the result of a challenge step (or an accepted invitation) when it is a session. */
  completeChallenge: (result: LoginResult) => void;
  logout: () => Promise<void>;
  /** Re-reads the current user (e.g. after own roles changed). */
  reload: () => Promise<void>;
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

  const completeChallenge = useCallback(
    (result: LoginResult) => {
      if (result.kind === 'session') applySession(result);
    },
    [applySession],
  );

  const login = useCallback(
    async (email: string, password: string) => {
      const result = await api<LoginResult>('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      });
      completeChallenge(result);
      return result;
    },
    [completeChallenge],
  );

  const logout = useCallback(async () => {
    await api('/auth/logout', { method: 'POST' }).catch(() => undefined);
    applySession(null);
  }, [applySession]);

  const reload = useCallback(async () => {
    const me = await api<AuthUser>('/auth/me').catch(() => null);
    if (me) setUser(me);
  }, []);

  const value = useMemo<AuthContextValue>(() => {
    const permissions = new Set(user?.permissions ?? []);
    return {
      status,
      user,
      login,
      completeChallenge,
      logout,
      reload,
      can: (p) => permissions.has(p),
    };
  }, [status, user, login, completeChallenge, logout, reload]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
