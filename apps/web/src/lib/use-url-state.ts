'use client';

import { useCallback, useEffect, useMemo, useRef } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';

type UrlValue = string | string[];

/**
 * Page state kept in the query string, so Back/Forward and shared links restore it.
 * Values equal to their default are left out of the URL.
 */
export function useUrlState<T extends Record<string, UrlValue>>(
  defaults: T,
): [T, (patch: Partial<T>) => void, () => void] {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const key = params.toString();

  const state = useMemo(() => {
    const out: Record<string, UrlValue> = { ...defaults };
    for (const [k, def] of Object.entries(defaults)) {
      if (Array.isArray(def)) {
        const all = params.getAll(k).flatMap((v) => v.split(',')).filter(Boolean);
        if (all.length) out[k] = all;
      } else {
        const v = params.get(k);
        if (v !== null) out[k] = v;
      }
    }
    return out as T;
    // `key` captures every param change; `defaults` is expected to be stable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  // Latest state we asked for: several patches in one tick must build on each other,
  // not all start from the last rendered URL (router.replace is asynchronous).
  const latest = useRef<Record<string, UrlValue>>(state);
  useEffect(() => {
    latest.current = state;
  }, [state]);

  const write = useCallback(
    (next: Record<string, UrlValue>) => {
      latest.current = next;
      const sp = new URLSearchParams();
      for (const [k, v] of Object.entries(next)) {
        const def = defaults[k];
        if (Array.isArray(v)) {
          if (v.length && JSON.stringify(v) !== JSON.stringify(def)) sp.set(k, v.join(','));
        } else if (v !== '' && v !== def) {
          sp.set(k, v);
        }
      }
      const qs = sp.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [defaults, pathname, router],
  );

  const patch = useCallback(
    (p: Partial<T>) => write({ ...latest.current, ...p } as Record<string, UrlValue>),
    [write],
  );
  const reset = useCallback(() => write({ ...defaults }), [defaults, write]);

  return [state, patch, reset];
}
