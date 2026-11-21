'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { en, type MessageKey } from '@/locales/en';
import { fr } from '@/locales/fr';

export type Locale = 'fr' | 'en';
export const LOCALES: { code: Locale; label: string }[] = [
  { code: 'fr', label: 'Français' },
  { code: 'en', label: 'English' },
];
const DEFAULT_LOCALE: Locale = 'fr';
const STORAGE_KEY = 'erp.locale';

const DICTIONARIES: Record<Locale, Record<MessageKey, string>> = { en, fr };

export type TFunction = (key: MessageKey, vars?: Record<string, string | number>) => string;

interface I18nContextValue {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: TFunction;
  /** Translate a key built at runtime (e.g. `nav.${item.key}`); falls back to `fallback`. */
  tx: (key: string, fallback: string, vars?: Record<string, string | number>) => string;
}

const I18nContext = createContext<I18nContextValue | null>(null);

function interpolate(text: string, vars?: Record<string, string | number>) {
  if (!vars) return text;
  return text.replace(/\{(\w+)\}/g, (_, name: string) => String(vars[name] ?? `{${name}}`));
}

export function I18nProvider({ children }: { children: React.ReactNode }) {
  // Start with the default on both server and client to avoid a hydration
  // mismatch, then switch to the saved choice.
  const [locale, setLocaleState] = useState<Locale>(DEFAULT_LOCALE);

  useEffect(() => {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (saved === 'fr' || saved === 'en') setLocaleState(saved);
  }, []);

  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  const setLocale = useCallback((next: Locale) => {
    window.localStorage.setItem(STORAGE_KEY, next);
    setLocaleState(next);
  }, []);

  const value = useMemo<I18nContextValue>(() => {
    const dict = DICTIONARIES[locale];
    const t: TFunction = (key, vars) => interpolate(dict[key] ?? en[key] ?? key, vars);
    const tx = (key: string, fallback: string, vars?: Record<string, string | number>) =>
      interpolate((dict as Record<string, string>)[key] ?? fallback, vars);
    return { locale, setLocale, t, tx };
  }, [locale, setLocale]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nContextValue {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error('useI18n must be used inside <I18nProvider>');
  return ctx;
}
