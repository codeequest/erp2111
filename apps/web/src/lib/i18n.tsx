'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { en, fr, type MessageKey } from './messages';

/**
 * Small built-in i18n (no extra dependency): French / English, chosen with the
 * switch in the top bar and remembered in this browser.
 *
 *   const { t, lang, money, date } = useI18n();
 *   t('sup.created', { code: 'SUP-00001' })
 */
export type Lang = 'en' | 'fr';

const DICTS: Record<Lang, Record<MessageKey, string>> = { en, fr };
/** fr-TN: "1 234,50" and dd/mm/yyyy; en-GB keeps dd/mm/yyyy too (used in Tunisia). */
const LOCALES: Record<Lang, string> = { en: 'en-GB', fr: 'fr-TN' };
const STORAGE_KEY = 'erp.lang';
/** Tunisian dinar: 1 TND = 1000 millimes */
export const MONEY_DECIMALS = 3;

type Vars = Record<string, string | number>;

interface I18n {
  lang: Lang;
  locale: string;
  setLang: (lang: Lang) => void;
  t: (key: MessageKey, vars?: Vars) => string;
  /** Has a translation for this key (e.g. navigation entries) */
  has: (key: string) => key is MessageKey;
  /** Dinar amount → "1 234,500" / "1,234.500": 3 decimals (millimes), up to 4 for unit prices */
  money: (value: string | number | null | undefined) => string;
  /** Quantity: no forced decimals, up to 4 */
  qty: (value: string | number | null | undefined) => string;
  /** "2026-11-26" or ISO → 26/11/2026 */
  date: (value: string | null | undefined) => string;
  /** ISO → 26/11/2026 10:32 */
  dateTime: (value: string | null | undefined) => string;
  number: (value: number, decimals?: number) => string;
}

const I18nContext = createContext<I18n | null>(null);

function initialLang(): Lang {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === 'en' || saved === 'fr') return saved;
  } catch {
    /* storage unavailable */
  }
  return typeof navigator !== 'undefined' && navigator.language?.startsWith('fr') ? 'fr' : 'en';
}

export function I18nProvider({ children }: { children: React.ReactNode }) {
  // Start in English (as the server renders), then switch to the saved choice.
  const [lang, setLangState] = useState<Lang>('en');
  useEffect(() => setLangState(initialLang()), []);

  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  const setLang = useCallback((next: Lang) => {
    setLangState(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* not remembered: fine */
    }
  }, []);

  const value = useMemo<I18n>(() => {
    const dict = DICTS[lang];
    const locale = LOCALES[lang];
    const num = (v: string | number | null | undefined) => {
      if (v === null || v === undefined || v === '') return null;
      const n = Number(v);
      return Number.isFinite(n) ? n : null;
    };
    const toDate = (v: string) =>
      /^\d{4}-\d{2}-\d{2}$/.test(v) ? new Date(`${v}T00:00:00`) : new Date(v);
    return {
      lang,
      locale,
      setLang,
      t: (key, vars) => {
        const text = dict[key] ?? en[key] ?? key;
        return vars
          ? text.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m))
          : text;
      },
      has: (key: string): key is MessageKey => key in dict,
      money: (v) => {
        const n = num(v);
        return n === null
          ? '—'
          : n.toLocaleString(locale, {
              minimumFractionDigits: MONEY_DECIMALS,
              maximumFractionDigits: 4,
            });
      },
      qty: (v) => {
        const n = num(v);
        return n === null ? '—' : n.toLocaleString(locale, { maximumFractionDigits: 4 });
      },
      date: (v) => (v ? toDate(v).toLocaleDateString(locale) : '—'),
      dateTime: (v) =>
        v
          ? toDate(v).toLocaleString(locale, {
              dateStyle: 'short',
              timeStyle: 'short',
              // 24-hour clock in French ("10:32", not "10:32 AM")
              ...(lang === 'fr' && { hourCycle: 'h23' as const }),
            })
          : '—',
      number: (n, decimals = 0) =>
        n.toLocaleString(locale, {
          minimumFractionDigits: decimals,
          maximumFractionDigits: decimals,
        }),
    };
  }, [lang, setLang]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18n {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error('useI18n must be used inside <I18nProvider>');
  return ctx;
}
