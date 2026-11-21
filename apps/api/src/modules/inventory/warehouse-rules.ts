/**
 * Why a warehouse cannot be deactivated, or null if it can.
 *  - Stock left in an inactive warehouse would be invisible and unusable:
 *    transfer or adjust it to zero first.
 *  - The company always needs at least one active warehouse.
 */
export function deactivationBlocker(input: {
  otherActiveWarehouses: number;
  productsWithStock: number;
}): string | null {
  if (input.productsWithStock > 0) {
    return `This warehouse still holds stock for ${input.productsWithStock} product(s). Transfer or adjust it to zero first.`;
  }
  if (input.otherActiveWarehouses === 0) {
    return 'At least one warehouse must stay active.';
  }
  return null;
}
