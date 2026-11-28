import * as path from 'node:path';
import { extractMessages } from './extract-messages';
import { MESSAGES_AR } from './messages-ar';
import { langOf, translateBody, translateMessage } from './translate';

const placeholders = (s: string) => (s.match(/\{\d+\}/g) ?? []).sort().join(',');

describe('API messages in Arabic', () => {
  const found = extractMessages(path.join(__dirname, '..', '..'));

  it('finds the messages of the code', () => {
    expect(found.length).toBeGreaterThan(100);
  });

  it('has an Arabic translation for every message', () => {
    const missing = found.filter((m) => !(m.template in MESSAGES_AR) && translateMessage(m.template, 'ar') === m.template);
    if (missing.length) {
      throw new Error(`${missing.length} message(s) without Arabic:\n` + missing.map((m) => `  "${m.template}"   (${m.where})`).join('\n'));
    }
  });

  it('keeps every placeholder in the translations', () => {
    const bad = Object.entries(MESSAGES_AR).filter(([en, ar]) => placeholders(en) !== placeholders(ar));
    expect(bad).toEqual([]);
  });

  it('translates nested messages and keeps the values', () => {
    expect(translateMessage('Line 3: quantity must be more than zero', 'ar')).not.toContain('quantity must');
    expect(translateMessage('Line 3: quantity must be more than zero', 'ar')).toContain('3');
    expect(translateMessage('Line 3: quantity must be more than zero', 'en')).toBe('Line 3: quantity must be more than zero');
    expect(translateMessage('a message nobody wrote', 'ar')).toBe('a message nobody wrote');
  });

  it('translates class-validator messages with the field name', () => {
    expect(translateMessage('warehouseId must be a UUID', 'ar')).toContain('warehouseId');
    expect(translateMessage('warehouseId must be a UUID', 'ar')).not.toContain('must be');
  });

  it('translates only error fields of response bodies', () => {
    const body = { name: 'product does not exist', rows: [{ errors: ['product does not exist'] }], errors: [{ line: 2, error: 'sku is empty' }] };
    const out = translateBody(body, 'ar');
    expect(out.name).toBe('product does not exist');
    expect(out.rows[0].errors[0]).not.toBe('product does not exist');
    expect(out.errors[0].error).not.toBe('sku is empty');
    expect(out.errors[0].line).toBe(2);
  });

  it('reads the language from header, cookie or Accept-Language', () => {
    expect(langOf({ headers: { 'x-lang': 'ar' } })).toBe('ar');
    expect(langOf({ headers: {}, cookies: { erp_lang: 'ar' } })).toBe('ar');
    expect(langOf({ headers: { 'accept-language': 'ar-SA,ar;q=0.9' } })).toBe('ar');
    expect(langOf({ headers: { 'x-lang': 'en' }, cookies: { erp_lang: 'ar' } })).toBe('en');
    expect(langOf({})).toBe('en');
  });
});
