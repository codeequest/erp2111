'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
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

const WIDTH = 208;

/**
 * Dropdown menu. Rendered in a portal with fixed positioning so table rows
 * (each its own stacking context while animating) can't paint over it.
 * Flips upward near the bottom of the screen; closes on outside click, Esc, scroll.
 */
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
  const [pos, setPos] = useState<{ top: number; left: number; up: boolean } | null>(null);
  const btn = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    if (!open || !btn.current) return;
    const r = btn.current.getBoundingClientRect();
    const height = panel.current?.offsetHeight ?? 200;
    const up = r.bottom + height + 8 > window.innerHeight && r.top > height + 8;
    const left = align === 'right' ? r.right - WIDTH : r.left;
    setPos({
      top: up ? r.top - height - 4 : r.bottom + 4,
      left: Math.max(8, Math.min(left, window.innerWidth - WIDTH - 8)),
      up,
    });
  }, [open, align]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (!panel.current?.contains(t) && !btn.current?.contains(t)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    const close = () => setOpen(false);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    window.addEventListener('resize', close);
    window.addEventListener('scroll', close, true);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('resize', close);
      window.removeEventListener('scroll', close, true);
    };
  }, [open]);

  const visible = items.filter((i, idx, arr) => {
    if (i !== 'separator') return true;
    return idx > 0 && idx < arr.length - 1 && arr[idx - 1] !== 'separator';
  });
  if (!visible.some((i) => i !== 'separator')) return null;

  return (
    <span className="inline-block" onClick={(e) => e.stopPropagation()}>
      <button
        ref={btn}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={label}
        onClick={() => {
          setPos(null);
          setOpen((o) => !o);
        }}
        className={triggerClassName}
      >
        {trigger}
      </button>
      {open &&
        createPortal(
          <div
            ref={panel}
            role="menu"
            onClick={(e) => e.stopPropagation()}
            style={{ top: pos?.top ?? -9999, left: pos?.left ?? -9999, width: WIDTH }}
            className={clsx(
              'fixed z-[70] overflow-hidden rounded-xl bg-white p-1 shadow-xl ring-1 ring-slate-900/10',
              pos && 'animate-scale-in',
              pos?.up ? 'origin-bottom' : 'origin-top',
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
          </div>,
          document.body,
        )}
    </span>
  );
}
