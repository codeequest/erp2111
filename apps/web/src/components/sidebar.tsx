'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import clsx from 'clsx';
import { NAVIGATION } from '@erp/shared';
import { useAuth } from '@/lib/auth';
import { ITEM_ICONS, MODULE_COLORS } from './icons';

export function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const { can } = useAuth();

  return (
    <nav className="flex h-full flex-col bg-slate-900 text-slate-300">
      <div className="flex h-16 items-center gap-2 border-b border-slate-800 px-5">
        <div className="grid size-8 place-items-center rounded-lg bg-blue-600 text-sm font-bold text-white">
          E
        </div>
        <span className="text-lg font-semibold text-white">ERP</span>
      </div>

      <div className="flex-1 space-y-5 overflow-y-auto px-3 py-4">
        {NAVIGATION.map((module) => {
          const items = module.items.filter((item) => can(item.permission));
          if (items.length === 0) return null;
          const color = MODULE_COLORS[module.key];
          return (
            <div key={module.key}>
              {module.key !== 'dashboard' && (
                <p className="mb-1 flex items-center gap-2 px-2 text-[11px] font-semibold tracking-wider text-slate-500 uppercase">
                  <span className={clsx('size-1.5 rounded-full', color.bg)} />
                  {module.label}
                </p>
              )}
              <ul className="space-y-0.5">
                {items.map((item) => {
                  const Icon = ITEM_ICONS[item.key];
                  const active = pathname === item.href || pathname.startsWith(item.href + '/');
                  return (
                    <li key={item.key}>
                      <Link
                        href={item.href}
                        onClick={onNavigate}
                        className={clsx(
                          'flex items-center gap-3 rounded-md px-2 py-1.5 text-sm transition-colors',
                          active
                            ? 'bg-slate-800 font-medium text-white'
                            : 'hover:bg-slate-800/60 hover:text-white',
                        )}
                      >
                        {Icon && <Icon className={clsx('size-4', active && color.text)} />}
                        {item.label}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}
      </div>

      <p className="border-t border-slate-800 px-5 py-3 text-xs text-slate-500">
        v0.2.0 · identity & access
      </p>
    </nav>
  );
}
