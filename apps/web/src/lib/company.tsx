'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { PublicSettings } from '@erp/shared';
import { api } from './api';
import { useAuth } from './auth';
import { useI18n } from './i18n';
import { formatMoney } from './format';

interface CompanyContextValue {
  company: PublicSettings | null;
  /** Format an amount in the company currency (TND → 3 decimals). */
  money: (value: string | number | null | undefined) => string;
  /** Re-read after the settings page saved a change. */
  refresh: () => Promise<void>;
}

const CompanyContext = createContext<CompanyContextValue | null>(null);

export function CompanyProvider({ children }: { children: React.ReactNode }) {
  const { status } = useAuth();
  const { locale } = useI18n();
  const [company, setCompany] = useState<PublicSettings | null>(null);

  const refresh = useCallback(async () => {
    setCompany(await api<PublicSettings>('/settings/public').catch(() => null));
  }, []);

  useEffect(() => {
    if (status === 'authenticated') void refresh();
  }, [status, refresh]);

  const value = useMemo<CompanyContextValue>(
    () => ({
      company,
      money: (v) => formatMoney(v, company?.currency ?? 'TND', locale),
      refresh,
    }),
    [company, locale, refresh],
  );

  return <CompanyContext.Provider value={value}>{children}</CompanyContext.Provider>;
}

export function useCompany(): CompanyContextValue {
  const ctx = useContext(CompanyContext);
  if (!ctx) throw new Error('useCompany must be used inside <CompanyProvider>');
  return ctx;
}
