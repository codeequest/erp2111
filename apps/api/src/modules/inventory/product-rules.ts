import { toDecimal } from '../../common/decimal';

export interface ProductUnitInput {
  unitId: string;
  factor: string;
  barcode?: string | null;
}

/**
 * Checks the extra purchase / sale units of a product. Returns a list of
 * human-readable problems (empty = valid).
 */
export function productUnitProblems(
  baseUnitId: string,
  productBarcode: string | null | undefined,
  units: ProductUnitInput[],
): string[] {
  const problems: string[] = [];
  const seenUnits = new Set<string>();
  const seenBarcodes = new Set<string>(productBarcode ? [productBarcode] : []);

  for (const u of units) {
    if (u.unitId === baseUnitId) {
      problems.push('The base unit cannot also be listed as an extra unit');
    }
    if (seenUnits.has(u.unitId)) problems.push('The same unit is listed twice');
    seenUnits.add(u.unitId);

    if (!toDecimal(u.factor).greaterThan(0)) problems.push('A unit factor must be greater than 0');

    if (u.barcode) {
      if (seenBarcodes.has(u.barcode)) problems.push(`Barcode "${u.barcode}" is used twice`);
      seenBarcodes.add(u.barcode);
    }
  }
  return [...new Set(problems)];
}

/** Every barcode a product claims (its own + its units'). */
export function allBarcodes(
  productBarcode: string | null | undefined,
  units: { barcode?: string | null }[],
): string[] {
  return [productBarcode, ...units.map((u) => u.barcode)].filter((b): b is string => !!b);
}
