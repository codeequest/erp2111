'use client';

import { Bell, LogOut, Menu, Search } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';

export function Topbar({ onMenu }: { onMenu: () => void }) {
  const { user, logout } = useAuth();
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
        aria-label="Open menu"
      >
        <Menu className="size-5" />
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
          aria-label="Log out"
          title="Log out"
        >
          <LogOut className="size-5" />
        </button>
      </div>
    </header>
  );
}
