/**
 * Pure business rules for products — no database access, fully unit-tested
 * in product-rules.spec.ts.
 */

export interface VariantOption {
  /** e.g. "Size" */
  name: string;
  /** e.g. ["S", "M", "L"] */
  values: string[];
}

/** One variant = one value per option, e.g. { Size: "M", Colour: "Red" }. */
export type VariantValues = Record<string, string>;

export const MAX_VARIANT_OPTIONS = 3;
export const MAX_VARIANTS = 200;

/**
 * Trims names / values, drops empty values and duplicates (case-insensitive).
 * Throws when the options are unusable.
 */
export function normalizeVariantOptions(options: VariantOption[]): VariantOption[] {
  const result: VariantOption[] = [];
  const seenNames = new Set<string>();
  for (const opt of options) {
    const name = opt.name.trim();
    if (!name) throw new Error('Every variant option needs a name');
    if (seenNames.has(name.toLowerCase())) throw new Error(`Option "${name}" is listed twice`);
    seenNames.add(name.toLowerCase());

    const seenValues = new Set<string>();
    const values: string[] = [];
    for (const raw of opt.values) {
      const v = raw.trim();
      if (!v || seenValues.has(v.toLowerCase())) continue;
      seenValues.add(v.toLowerCase());
      values.push(v);
    }
    if (values.length === 0) throw new Error(`Option "${name}" needs at least one value`);
    result.push({ name, values });
  }
  if (result.length === 0) throw new Error('A product with variants needs at least one option');
  if (result.length > MAX_VARIANT_OPTIONS) {
    throw new Error(`At most ${MAX_VARIANT_OPTIONS} variant options are allowed`);
  }
  return result;
}

/** Cartesian product of the option values, in option order. */
export function buildVariantCombinations(options: VariantOption[]): VariantValues[] {
  let combos: VariantValues[] = [{}];
  for (const opt of options) {
    combos = combos.flatMap((c) => opt.values.map((v) => ({ ...c, [opt.name]: v })));
  }
  if (combos.length > MAX_VARIANTS) {
    throw new Error(`Too many variants (${combos.length}); the maximum is ${MAX_VARIANTS}`);
  }
  return combos;
}

/** Stable key of a combination, independent of property order and case. */
export function variantKey(values: VariantValues): string {
  return Object.keys(values)
    .sort()
    .map((k) => `${k.toLowerCase()}=${values[k].toLowerCase()}`)
    .join('|');
}

/** "T-shirt" + {Size: M, Colour: Red} → "T-shirt - M / Red" */
export function variantName(parentName: string, values: VariantValues): string {
  return `${parentName} - ${Object.values(values).join(' / ')}`;
}

/** "TSHIRT" + {Size: M, Colour: "Light blue"} → "TSHIRT-M-LIGHTBLUE" */
export function variantSku(parentSku: string, values: VariantValues): string {
  const parts = Object.values(values).map((v) =>
    v
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^A-Za-z0-9]/g, '')
      .toUpperCase(),
  );
  return [parentSku, ...parts.filter(Boolean)].join('-');
}

/** A product is low on stock when a threshold is set and on-hand is below it. */
export function isLowStock(onHand: number, minStock: number): boolean {
  return minStock > 0 && onHand < minStock;
}

/**
 * How many days the current stock lasts at the average daily sales of the period.
 * null when nothing was sold (infinite / unknown coverage).
 */
export function stockCoverageDays(onHand: number, soldQty: number, periodDays: number): number | null {
  if (soldQty <= 0 || periodDays <= 0) return null;
  const perDay = soldQty / periodDays;
  return Math.max(0, Math.floor(onHand / perDay));
}

/** Gross margin in % of revenue; null when there is no revenue. */
export function marginPct(revenue: number, cost: number): number | null {
  if (revenue <= 0) return null;
  return Math.round(((revenue - cost) / revenue) * 10000) / 100;
}
