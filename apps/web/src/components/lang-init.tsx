'use client';

import { initLang, type Lang } from '@/lib/i18n';

/**
 * Sets the language before the rest of the page renders (it is the first child
 * of <body>), on the server and in the browser.
 */
export function LangInit({ lang }: { lang: Lang }) {
  initLang(lang);
  return null;
}
