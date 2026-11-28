import { MESSAGES_AR } from './messages-ar';

/**
 * Translates API messages for the user's language.
 *
 * Messages are matched against templates: "Line {1}: {2}" matches
 * "Line 3: quantity must be more than zero". Each placeholder captures a value
 * (a SKU, a number…) that is put back into the Arabic sentence, after being
 * translated itself when it is a known message (messages can be nested).
 * Anything that matches no template is returned unchanged.
 */
export type ApiLang = 'en' | 'ar';

interface Compiled {
  re: RegExp;
  ar: string;
  literal: number;
}

const exact = new Map<string, string>();
const patterns: Compiled[] = [];

for (const [en, ar] of Object.entries(MESSAGES_AR)) {
  if (!/\{\d+\}/.test(en)) {
    exact.set(en, ar);
    continue;
  }
  const source = en
    .split(/(\{\d+\})/)
    .map((part) => (/^\{\d+\}$/.test(part) ? '([\\s\\S]+?)' : part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
    .join('');
  patterns.push({ re: new RegExp(`^${source}$`), ar, literal: en.replace(/\{\d+\}/g, '').length });
}
// Most specific templates first: "Line {1}: quantity…" before "Line {1}: {2}".
patterns.sort((a, b) => b.literal - a.literal);

export function translateMessage(message: string, lang: ApiLang, depth = 0): string {
  if (lang !== 'ar' || !message || depth > 4) return message;
  const hit = exact.get(message);
  if (hit !== undefined) return hit;
  for (const p of patterns) {
    const m = p.re.exec(message);
    if (m) {
      return p.ar.replace(/\{(\d+)\}/g, (_, i: string) => translateMessage(m[Number(i)] ?? '', lang, depth + 1));
    }
  }
  return message;
}

/** Language of a request: X-Lang header, then the erp_lang cookie, then Accept-Language. */
export function langOf(req: {
  headers?: Record<string, string | string[] | undefined>;
  cookies?: Record<string, string | undefined>;
}): ApiLang {
  const header = req.headers?.['x-lang'];
  const value =
    (Array.isArray(header) ? header[0] : header) ??
    req.cookies?.erp_lang ??
    (String(req.headers?.['accept-language'] ?? '').toLowerCase().startsWith('ar') ? 'ar' : 'en');
  return value === 'ar' ? 'ar' : 'en';
}

/**
 * Translates the messages inside a successful response: the `error` and
 * `errors` fields of import reports (row by row errors). Other data, such
 * as product names, is never touched.
 */
export function translateBody<T>(body: T, lang: ApiLang): T {
  if (lang !== 'ar' || body === null || typeof body !== 'object') return body;
  const visit = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(visit);
    if (!v || typeof v !== 'object' || v instanceof Date || Buffer.isBuffer(v)) return v;
    const proto = Object.getPrototypeOf(v);
    if (proto !== Object.prototype && proto !== null) return v; // class instances (files, decimals)
    const out: Record<string, unknown> = {};
    for (const [k, val] of Object.entries(v)) {
      if (k === 'error' && typeof val === 'string') out[k] = translateMessage(val, lang);
      else if (k === 'errors' && Array.isArray(val)) out[k] = val.map((e) => (typeof e === 'string' ? translateMessage(e, lang) : visit(e)));
      else out[k] = visit(val);
    }
    return out;
  };
  return visit(body) as T;
}
