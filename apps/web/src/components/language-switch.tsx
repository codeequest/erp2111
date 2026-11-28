'use client';

import { Languages } from 'lucide-react';
import clsx from 'clsx';
import { getLang, setLanguage } from '@/lib/i18n';

/** Button that switches between English and Arabic (the page reloads). */
export function LanguageSwitch({ className }: { className?: string }) {
  const lang = getLang();
  const next = lang === 'ar' ? 'en' : 'ar';
  return (
    <button
      type="button"
      onClick={() => setLanguage(next)}
      className={clsx(
        'flex items-center gap-1.5 rounded-md px-2 py-1.5 text-sm text-slate-600 hover:bg-slate-100',
        className,
      )}
      title={next === 'ar' ? 'التبديل إلى العربية' : 'Switch to English'}
      lang={next}
    >
      <Languages className="size-4" />
      {next === 'ar' ? 'العربية' : 'English'}
    </button>
  );
}
