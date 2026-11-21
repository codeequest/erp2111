'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from './api';

interface QueryState<T> {
  data: T | undefined;
  error: Error | null;
  loading: boolean;
  /** Fetch again (e.g. after a create / update). */
  reload: () => Promise<void>;
}

/**
 * Loads `path` from the API and re-loads whenever it changes.
 * Pass `null` to skip loading. Ignores responses that arrive out of order.
 */
export function useApiQuery<T>(path: string | null): QueryState<T> {
  const [data, setData] = useState<T | undefined>(undefined);
  const [error, setError] = useState<Error | null>(null);
  const [loading, setLoading] = useState(path !== null);
  const requestId = useRef(0);

  const load = useCallback(async () => {
    if (path === null) return;
    const id = ++requestId.current;
    setLoading(true);
    try {
      const result = await api<T>(path);
      if (id === requestId.current) {
        setData(result);
        setError(null);
      }
    } catch (err) {
      if (id === requestId.current) setError(err as Error);
    } finally {
      if (id === requestId.current) setLoading(false);
    }
  }, [path]);

  useEffect(() => {
    void load();
  }, [load]);

  return { data, error, loading, reload: load };
}

/** Builds `/path?key=value…`, skipping empty values. */
export function withQuery(
  path: string,
  params: Record<string, string | number | undefined | null>,
) {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== '') qs.set(k, String(v));
  }
  const s = qs.toString();
  return s ? `${path}?${s}` : path;
}

/** Returns `value` once it has stopped changing for `delay` ms (for search boxes). */
export function useDebounced<T>(value: T, delay = 300): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(id);
  }, [value, delay]);
  return debounced;
}
