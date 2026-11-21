'use client';

import { Languages, LogOut, Menu } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { LOCALES, useI18n } from '@/lib/i18n';
import { roleLabel } from '@/lib/labels';

export function Topbar({ onMenu }: { onMenu: () => void }) {
  const { user, logout } = useAuth();
  const { t, locale, setLocale } = useI18n();
  const router = useRouter();
  const initials = user?.fullName
    .split(' ')
    .map((w) => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

  return (
    <header className="sticky top-0 z-20 print:hidden flex h-16 items-center gap-3 border-b border-slate-200 bg-white/90 px-4 backdrop-blur md:px-6">
      <button
        onClick={onMenu}
        className="rounded-md p-2 text-slate-600 hover:bg-slate-100 lg:hidden"
        aria-label={t('topbar.openMenu')}
      >
        <Menu className="size-5" />
      </button>

      <div className="ml-auto flex items-center gap-2">
        <label className="flex items-center gap-1.5 rounded-md px-2 py-1.5 text-slate-500 hover:bg-slate-100">
          <Languages className="size-4" aria-hidden />
          <span className="sr-only">{t('topbar.language')}</span>
          <select
            value={locale}
            onChange={(e) => setLocale(e.target.value as typeof locale)}
            className="cursor-pointer bg-transparent text-sm text-slate-600 outline-none"
          >
            {LOCALES.map((l) => (
              <option key={l.code} value={l.code}>
                {l.label}
              </option>
            ))}
          </select>
        </label>

        <div className="hidden text-right sm:block">
          <p className="text-sm leading-tight font-medium text-slate-900">{user?.fullName}</p>
          <p className="text-xs leading-tight text-slate-500">
            {user?.roles.map((r) => roleLabel(r, t)).join(', ')}
          </p>
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
