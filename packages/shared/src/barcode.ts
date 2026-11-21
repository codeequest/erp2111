/**
 * Barcode checks shared by the API and the web app.
 *
 * Retail barcodes (EAN-8, UPC-A, EAN-13, GTIN-14) are all digits and end with a
 * check digit computed from the others, so a mistyped or mis-scanned number can be
 * detected. Other barcodes (Code 128, internal codes with letters…) have no standard
 * check digit and are accepted as they are.
 */

/** Lengths of the GTIN family: EAN-8, UPC-A (12), EAN-13, GTIN-14. */
const GTIN_LENGTHS = new Set([8, 12, 13, 14]);

/** True when the value looks like a retail barcode whose check digit we can verify. */
export function isGtinLike(value: string): boolean {
  return /^\d+$/.test(value) && GTIN_LENGTHS.has(value.length);
}

/**
 * GS1 check digit for the digits before it: weights 3,1,3,1… from the right.
 * e.g. "400638133393" → 1 (EAN-13 4006381333931).
 */
export function gtinCheckDigit(digitsWithoutCheck: string): number {
  let sum = 0;
  for (let i = 0; i < digitsWithoutCheck.length; i++) {
    const digit = Number(digitsWithoutCheck[digitsWithoutCheck.length - 1 - i]);
    sum += digit * (i % 2 === 0 ? 3 : 1);
  }
  return (10 - (sum % 10)) % 10;
}

/**
 * Returns a user-friendly problem description, or null when the barcode is acceptable.
 * Only GTIN-like values (8/12/13/14 digits) are checked; anything else is accepted.
 */
export function barcodeProblem(raw: string): string | null {
  const value = raw.trim();
  if (value === '') return null;
  if (/\s/.test(value)) return 'A barcode cannot contain spaces';
  if (!isGtinLike(value)) return null;
  const expected = gtinCheckDigit(value.slice(0, -1));
  const actual = Number(value[value.length - 1]);
  return expected === actual
    ? null
    : `This barcode looks mistyped: with these digits the last one should be ${expected}, not ${actual}`;
}
