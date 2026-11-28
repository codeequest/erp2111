import { AR } from './i18n-ar';

/**
 * Translations: English is the source language. `tr('Stock counts')` returns
 * the Arabic text when the user picked Arabic, the English text otherwise.
 *
 * The language lives in the `erp_lang` cookie, so the server renders the right
 * language and direction (<html lang dir>) on the first load. Switching
 * language reloads the page, so every screen is drawn again in the new language.
 *
 * Placeholders: tr('{n} lines', { n: 3 }).
 */

export const LANGUAGES = [
  { code: 'en', label: 'English', dir: 'ltr' },
  { code: 'ar', label: 'العربية', dir: 'rtl' },
] as const;
export type Lang = (typeof LANGUAGES)[number]['code'];
export const LANG_COOKIE = 'erp_lang';

export function parseLang(value: string | null | undefined): Lang {
  return value === 'ar' ? 'ar' : 'en';
}

function readCookieLang(): Lang {
  if (typeof document === 'undefined') return 'en';
  return parseLang(/(?:^|;\s*)erp_lang=([^;]+)/.exec(document.cookie)?.[1]);
}

let current: Lang = readCookieLang();

/** Called by the root layout with the language from the cookie (server and browser). */
export function initLang(lang: Lang) {
  current = lang;
}

export function getLang(): Lang {
  return current;
}

export function dirOf(lang: Lang): 'ltr' | 'rtl' {
  return lang === 'ar' ? 'rtl' : 'ltr';
}

export function tr(text: string, params?: Record<string, string | number>): string {
  let out = current === 'ar' ? (AR[text] ?? text) : text;
  if (params) {
    for (const [k, v] of Object.entries(params)) out = out.split(`{${k}}`).join(String(v));
  }
  return out;
}

/** Saves the language and reloads the page in it. */
export function setLanguage(lang: Lang) {
  document.cookie = `${LANG_COOKIE}=${lang}; path=/; max-age=31536000; samesite=lax`;
  window.location.reload();
}
