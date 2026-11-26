/**
 * One-time message carried across a redirect (e.g. "PO-2026-00004 confirmed" after
 * creating an order). Kept in sessionStorage; failing storage just drops the message.
 */
export interface Flash {
  kind: 'success' | 'warning';
  message: string | string[];
}

const KEY = 'erp.purchasing.flash';

export function setFlash(flash: Flash) {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(flash));
  } catch {
    /* storage unavailable: no message */
  }
}

export function takeFlash(): Flash | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    sessionStorage.removeItem(KEY);
    return raw ? (JSON.parse(raw) as Flash) : null;
  } catch {
    return null;
  }
}
