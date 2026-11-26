import { SENSITIVE_PERMISSIONS, PermissionCode } from '@erp/shared';

export interface PermissionDiff {
  added: string[];
  removed: string[];
  sensitiveAdded: string[];
  sensitiveRemoved: string[];
}

const sensitive = (c: string) => SENSITIVE_PERMISSIONS.has(c as PermissionCode);

/** Difference between two permission sets (sorted, duplicates ignored). */
export function computeImpact(before: string[], after: string[]): PermissionDiff {
  const b = new Set(before);
  const a = new Set(after);
  const added = [...a].filter((c) => !b.has(c)).sort();
  const removed = [...b].filter((c) => !a.has(c)).sort();
  return {
    added,
    removed,
    sensitiveAdded: added.filter(sensitive),
    sensitiveRemoved: removed.filter(sensitive),
  };
}
