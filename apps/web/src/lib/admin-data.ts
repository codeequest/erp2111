'use client';

import { useCallback, useEffect, useState } from 'react';
import type { Page, RoleListItem } from '@erp/shared';
import { api } from './api';

let rolesCache: Promise<RoleListItem[]> | null = null;

/** All roles (for pickers and filters). Cached for the page session; call `refresh` after edits. */
export function useRoles(enabled = true) {
  const [roles, setRoles] = useState<RoleListItem[] | null>(null);
  const load = useCallback((force = false) => {
    if (force) rolesCache = null;
    rolesCache ??= api<Page<RoleListItem>>('/roles?pageSize=100').then((p) => p.items);
    rolesCache.then(setRoles).catch(() => {
      rolesCache = null;
      setRoles([]);
    });
  }, []);
  useEffect(() => {
    if (enabled) load();
  }, [enabled, load]);
  return { roles, refresh: () => load(true) };
}

export function invalidateRoles() {
  rolesCache = null;
}

/** Turns a flat filter object into a query string, skipping empty values. */
export function toQuery(
  params: Record<string, string | string[] | number | boolean | undefined | null>,
) {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === '') continue;
    if (Array.isArray(v)) {
      if (v.length) sp.set(k, v.join(','));
    } else sp.set(k, String(v));
  }
  const s = sp.toString();
  return s ? `?${s}` : '';
}
