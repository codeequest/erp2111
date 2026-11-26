'use client';

import { useRef } from 'react';
import clsx from 'clsx';

/** Six digit boxes. Typing moves forward, Backspace moves back, pasting fills all. */
export function OtpInput({
  value,
  onChange,
  onComplete,
  invalid = false,
  disabled = false,
  autoFocus = true,
}: {
  value: string;
  onChange: (v: string) => void;
  onComplete?: (v: string) => void;
  invalid?: boolean;
  disabled?: boolean;
  autoFocus?: boolean;
}) {
  const refs = useRef<(HTMLInputElement | null)[]>([]);
  const digits = Array.from({ length: 6 }, (_, i) => value[i] ?? '');

  const set = (next: string) => {
    const clean = next.replace(/\D/g, '').slice(0, 6);
    onChange(clean);
    if (clean.length === 6) onComplete?.(clean);
    refs.current[Math.min(clean.length, 5)]?.focus();
  };

  return (
    <div className={clsx('flex justify-center gap-2', invalid && 'animate-shake')} role="group" aria-label="6-digit code">
      {digits.map((d, i) => (
        <input
          key={i}
          ref={(el) => {
            refs.current[i] = el;
          }}
          value={d}
          disabled={disabled}
          inputMode="numeric"
          autoComplete={i === 0 ? 'one-time-code' : 'off'}
          autoFocus={autoFocus && i === 0}
          maxLength={1}
          aria-label={`Digit ${i + 1}`}
          onChange={(e) => {
            const ch = e.target.value.replace(/\D/g, '').slice(-1);
            if (!ch) return;
            set((value.slice(0, i) + ch + value.slice(i + 1)).slice(0, 6));
          }}
          onKeyDown={(e) => {
            if (e.key === 'Backspace') {
              e.preventDefault();
              if (d) set(value.slice(0, i) + value.slice(i + 1));
              else if (i > 0) {
                set(value.slice(0, i - 1) + value.slice(i));
                refs.current[i - 1]?.focus();
              }
            } else if (e.key === 'ArrowLeft' && i > 0) refs.current[i - 1]?.focus();
            else if (e.key === 'ArrowRight' && i < 5) refs.current[i + 1]?.focus();
          }}
          onPaste={(e) => {
            e.preventDefault();
            set(e.clipboardData.getData('text'));
          }}
          onFocus={(e) => e.target.select()}
          className={clsx(
            'size-11 rounded-xl border bg-white text-center font-mono text-lg font-semibold text-slate-900 shadow-sm transition outline-none sm:size-12',
            invalid
              ? 'border-rose-400 focus:ring-2 focus:ring-rose-500/20'
              : d
                ? 'border-indigo-400 focus:ring-2 focus:ring-indigo-500/20'
                : 'border-slate-300 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20',
          )}
        />
      ))}
    </div>
  );
}
