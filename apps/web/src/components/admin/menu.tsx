'use client';

import { useEffect, useRef, useState } from 'react';
import clsx from 'clsx';
import type { LucideIcon } from 'lucide-react';

export interface MenuItem {
  label: string;
  icon?: LucideIcon;
  onSelect: () => void;
  tone?: 'danger';
  disabled?: boolean;
  hint?: string;
}

/** Small dropdown menu anchored to its trigger. Closes on outside click and Escape. */
export function Menu({
  trigger,
  triggerClassName,
  items,
  align = 'right',
  label,
}: {
  /** Content of the trigger button (icon / text) — not a button itself. */
  trigger: React.ReactNode;
  triggerClassName?: string;
  items: (MenuItem | 'separator')[];
  align?: 'left' | 'right';
  label: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const visible = items.filter((i, idx, arr) => {
    if (i !== 'separator') return true;
    return idx > 0 && idx < arr.length - 1 && arr[idx - 1] !== 'separator';
  });
  if (!visible.some((i) => i !== 'separator')) return null;

  return (
    <div ref={ref} className="relative inline-block" onClick={(e) => e.stopPropagation()}>
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={label}
        onClick={() => setOpen((o) => !o)}
        className={triggerClassName}
      >
        {trigger}
      </button>
      {open && (
        <div
          role="menu"
          className={clsx(
            'animate-scale-in absolute z-30 mt-1 min-w-48 overflow-hidden rounded-xl bg-white p-1 shadow-xl ring-1 ring-slate-900/10',
            align === 'right' ? 'right-0 origin-top-right' : 'left-0 origin-top-left',
          )}
        >
          {visible.map((item, i) =>
            item === 'separator' ? (
              <div key={`s${i}`} className="my-1 h-px bg-slate-100" />
            ) : (
              <button
                key={item.label}
                role="menuitem"
                disabled={item.disabled}
                title={item.hint}
                onClick={() => {
                  setOpen(false);
                  item.onSelect();
                }}
                className={clsx(
                  'flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm transition disabled:cursor-not-allowed disabled:opacity-40',
                  item.tone === 'danger'
                    ? 'text-rose-600 hover:bg-rose-50'
                    : 'text-slate-700 hover:bg-slate-100',
                )}
              >
                {item.icon && <item.icon className="size-4 shrink-0" />}
                {item.label}
              </button>
            ),
          )}
        </div>
      )}
    </div>
  );
}
