'use client';

import { Bell, ChevronDown, KeyRound, LogOut, Menu as MenuIcon, Search } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { Avatar } from './admin/avatar';
import { Menu } from './admin/menu';

export function Topbar({ onMenu }: { onMenu: () => void }) {
  const { user, logout } = useAuth();
  const router = useRouter();

  return (
    <header className="sticky top-0 z-20 flex h-16 items-center gap-3 border-b border-slate-200 bg-white/80 px-4 backdrop-blur-md md:px-6">
      <button
        onClick={onMenu}
        className="rounded-md p-2 text-slate-600 hover:bg-slate-100 lg:hidden"
        aria-label="Open menu"
      >
        <MenuIcon className="size-5" />
      </button>

      <div className="relative hidden max-w-md flex-1 sm:block">
        <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate-400" />
        <input
          disabled
          placeholder="Search products, customers, documents… (coming soon)"
          className="w-full rounded-md border border-slate-200 bg-slate-50 py-2 pr-3 pl-9 text-sm placeholder:text-slate-400"
        />
      </div>

      <div className="ml-auto flex items-center gap-2">
        <button
          className="rounded-md p-2 text-slate-500 hover:bg-slate-100"
          aria-label="Notifications"
          title="Notifications (coming soon)"
        >
          <Bell className="size-5" />
        </button>
        {user && (
          <Menu
            label="Account menu"
            triggerClassName="flex items-center gap-2 rounded-full py-1 pr-2 pl-1 transition hover:bg-slate-100 sm:rounded-lg sm:pl-2"
            trigger={
              <>
                <span className="hidden text-right sm:block">
                  <span className="block text-sm leading-tight font-medium text-slate-900">
                    {user.fullName}
                  </span>
                  <span className="block max-w-[12rem] truncate text-xs leading-tight text-slate-500">
                    {user.roles.join(', ') || 'No role'}
                  </span>
                </span>
                <Avatar id={user.id} name={user.fullName} size="sm" />
                <ChevronDown className="hidden size-4 text-slate-400 sm:block" />
              </>
            }
            items={[
              {
                label: 'Account security',
                icon: KeyRound,
                onSelect: () => router.push('/account/security'),
              },
              'separator',
              {
                label: 'Log out',
                icon: LogOut,
                tone: 'danger',
                onSelect: async () => {
                  await logout();
                  router.replace('/login');
                },
              },
            ]}
          />
        )}
      </div>
    </header>
  );
}
