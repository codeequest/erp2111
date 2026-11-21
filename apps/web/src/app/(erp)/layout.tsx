'use client';

import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import clsx from 'clsx';
import { useAuth } from '@/lib/auth';
import { Sidebar } from '@/components/sidebar';
import { Topbar } from '@/components/topbar';
import { ToastProvider } from '@/components/ui/toast';

/** Shell for every logged-in page: sidebar + top bar. Redirects to /login when signed out. */
export default function ErpLayout({ children }: { children: React.ReactNode }) {
  const { status } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    if (status === 'anonymous') router.replace(`/login?next=${encodeURIComponent(pathname)}`);
  }, [status, router, pathname]);

  if (status !== 'authenticated') {
    return (
      <div className="grid h-screen place-items-center text-slate-400">
        <Loader2 className="size-6 animate-spin" />
      </div>
    );
  }

  return (
    <ToastProvider>
      <div className="flex h-screen overflow-hidden">
        {/* Desktop sidebar */}
        <aside className="hidden w-64 shrink-0 lg:block">
          <Sidebar />
        </aside>

        {/* Mobile drawer */}
        <div
          className={clsx('fixed inset-0 z-40 lg:hidden', menuOpen ? 'visible' : 'invisible')}
          aria-hidden={!menuOpen}
        >
          <div
            className={clsx(
              'absolute inset-0 bg-slate-900/50 transition-opacity',
              menuOpen ? 'opacity-100' : 'opacity-0',
            )}
            onClick={() => setMenuOpen(false)}
          />
          <aside
            className={clsx(
              'absolute inset-y-0 left-0 w-64 transition-transform',
              menuOpen ? 'translate-x-0' : '-translate-x-full',
            )}
          >
            <Sidebar onNavigate={() => setMenuOpen(false)} />
          </aside>
        </div>

        <div className="flex min-w-0 flex-1 flex-col">
          <Topbar onMenu={() => setMenuOpen(true)} />
          <main className="flex-1 overflow-y-auto p-4 md:p-6">{children}</main>
        </div>
      </div>
    </ToastProvider>
  );
}
