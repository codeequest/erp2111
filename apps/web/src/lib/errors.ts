import type { MessageKey } from '@/locales/en';
import type { TFunction } from './i18n';
import { ApiRequestError } from './api';

/**
 * The API answers in English. Known business messages are translated here;
 * anything else is shown as-is.
 */
const KNOWN_MESSAGES: Record<string, MessageKey> = {
  'Invalid email or password': 'login.invalid',
  'A category cannot be its own parent': 'error.categoryCycle',
  'A category cannot be moved under one of its sub-categories': 'error.categoryCycle',
  'A category with this name already exists at this level': 'error.categoryNameTaken',
  'This category has sub-categories. Move or delete them first.': 'error.categoryHasChildren',
  'A unit with this code already exists': 'error.unitCodeTaken',
  'This unit is used by products and cannot be deleted': 'error.unitInUse',
  'A packaging cannot use the base unit of the product': 'error.packagingBaseUnit',
  'Packaging quantity must be greater than 0': 'error.packagingFactor',
  'This reference or barcode is already used by another product': 'error.duplicate',
  'Invalid packaging price': 'validation.amount',
  'Unsupported image (JPG, PNG or WebP only)': 'photo.badType',
  'Photo too large (2 MB maximum)': 'photo.tooBig',
  'File too large': 'photo.tooBig',
  // CSV import (per line)
  'Unit is missing': 'import.err.unitMissing',
  'Name is missing or too short': 'import.err.name',
  'Category name too long': 'import.err.category',
};

/** Messages with a variable part: regex → key + variable names. */
const PATTERNS: [RegExp, MessageKey, string[]][] = [
  [/^Barcode (.+) is already used by "(.+)"$/, 'error.barcodeTaken', ['barcode', 'name']],
  [/^Barcode (.+) is used twice$/, 'error.barcodeTwice', ['barcode']],
  [/^Reference (.+) is already used by "(.+)"$/, 'error.skuTaken', ['sku', 'name']],
  [/^This category contains (\d+) product/, 'error.categoryHasProducts', ['count']],
  // CSV import (per line)
  [/^Unknown unit "(.+)"/, 'import.err.unknownUnit', ['value']],
  [/^Invalid sale price "(.*)"$/, 'import.err.salePrice', ['value']],
  [/^Invalid purchase price "(.*)"$/, 'import.err.purchasePrice', ['value']],
  [/^Unknown VAT rate "(.*)"$/, 'import.err.vat', ['value']],
  [/^Invalid reference "(.*)"/, 'import.err.sku', ['value']],
  [/^Reference (.+) appears twice \(also line (\d+)\)$/, 'import.err.skuTwice', ['value', 'line']],
  [/^Invalid barcode "(.*)"$/, 'import.err.barcode', ['value']],
  [
    /^Barcode (.+) appears twice \(also line (\d+)\)$/,
    'import.err.barcodeTwice',
    ['value', 'line'],
  ],
  [/^Barcode (.+) is already used by another product$/, 'import.err.barcodeTaken', ['value']],
  [/^Invalid value "(.*)" in column active/, 'import.err.active', ['value']],
  [/^Missing column\(s\): (.+)$/, 'import.err.columns', ['value']],
  [/^The file is empty/, 'import.err.empty', []],
  [/^Too many lines \(maximum (\d+)\)$/, 'import.err.tooMany', ['value']],
];

/** Translates one API message (also used for the CSV import line errors). */
export function translateMessage(message: string, t: TFunction): string {
  const key = KNOWN_MESSAGES[message];
  if (key) return t(key);
  for (const [re, k, names] of PATTERNS) {
    const m = re.exec(message);
    if (m) return t(k, Object.fromEntries(names.map((n, i) => [n, m[i + 1]])));
  }
  return message;
}

export function errorMessage(err: unknown, t: TFunction): string {
  if (err instanceof ApiRequestError) {
    if (err.status === 403) return t('error.forbidden');
    if (err.status === 404) return t('error.notFound');
    if (err.status >= 500) return t('error.server');
    return translateMessage(err.message, t);
  }
  if (err instanceof TypeError) return t('error.network');
  return err instanceof Error ? err.message : t('error.server');
}
