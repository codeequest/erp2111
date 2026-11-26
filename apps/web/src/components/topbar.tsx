'use client';

import clsx from 'clsx';
import { Bell, Languages, LogOut, Menu, Search } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { useI18n, type Lang } from '@/lib/i18n';

export function Topbar({ onMenu }: { onMenu: () => void }) {
  const { user, logout } = useAuth();
  const { t } = useI18n();
  const router = useRouter();
  const initials = user?.fullName
    .split(' ')
    .map((w) => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

  return (
    <header className="sticky top-0 z-20 flex h-16 items-center gap-3 border-b border-slate-200 bg-white/90 px-4 backdrop-blur md:px-6">
      <button
        onClick={onMenu}
        className="rounded-md p-2 text-slate-600 hover:bg-slate-100 lg:hidden"
        aria-label={t('topbar.menu')}
      >
        <Menu className="size-5" />
      </button>

      <div className="relative hidden max-w-md flex-1 sm:block">
        <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate-400" />
        <input
          disabled
          placeholder={t('topbar.search')}
          className="w-full rounded-md border border-slate-200 bg-slate-50 py-2 pr-3 pl-9 text-sm placeholder:text-slate-400"
        />
      </div>

      <div className="ml-auto flex items-center gap-2">
        <LanguageSwitch />
        <button
          className="rounded-md p-2 text-slate-500 hover:bg-slate-100"
          aria-label={t('topbar.notifications')}
          title={t('topbar.notifications')}
        >
          <Bell className="size-5" />
        </button>
        <div className="hidden text-right sm:block">
          <p className="text-sm leading-tight font-medium text-slate-900">{user?.fullName}</p>
          <p className="text-xs leading-tight text-slate-500">{user?.roles.join(', ')}</p>
        </div>
        <div className="grid size-9 place-items-center rounded-full bg-blue-600 text-sm font-semibold text-white">
          {initials}
        </div>
        <button
          onClick={async () => {
            await logout();
            router.replace('/login');
          }}
          className="rounded-md p-2 text-slate-500 hover:bg-slate-100 hover:text-red-600"
          aria-label={t('topbar.logout')}
          title={t('topbar.logout')}
        >
          <LogOut className="size-5" />
        </button>
      </div>
    </header>
  );
}

const LANGS: { code: Lang; label: string; name: string }[] = [
  { code: 'fr', label: 'FR', name: 'Français' },
  { code: 'en', label: 'EN', name: 'English' },
];

/** FR | EN pill; the highlight slides to the chosen language. */
function LanguageSwitch() {
  const { lang, setLang, t } = useI18n();
  const index = LANGS.findIndex((l) => l.code === lang);
  return (
    <div
      role="radiogroup"
      aria-label={t('lang.switch')}
      title={t('lang.switch')}
      className="flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 py-1 pr-1 pl-2 shadow-sm"
    >
      <Languages className="size-4 text-slate-400" aria-hidden />
      <div className="relative grid grid-cols-2">
        <span
          aria-hidden
          className="absolute inset-y-0 left-0 w-1/2 rounded-full bg-gradient-to-br from-amber-500 to-orange-600 shadow-sm shadow-orange-600/30 transition-transform duration-300 ease-out"
          style={{ transform: `translateX(${index * 100}%)` }}
        />
        {LANGS.map((l) => (
          <button
            key={l.code}
            role="radio"
            aria-checked={lang === l.code}
            aria-label={l.name}
            onClick={() => setLang(l.code)}
            className={clsx(
              'relative z-10 rounded-full px-2.5 py-0.5 text-xs font-semibold transition-colors',
              lang === l.code ? 'text-white' : 'text-slate-500 hover:text-slate-800',
            )}
          >
            {l.label}
          </button>
        ))}
      </div>
    </div>
  );
}
