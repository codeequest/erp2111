import { deactivationBlocker } from './warehouse-rules';

describe('deactivationBlocker', () => {
  it('allows deactivating an empty warehouse when another one stays active', () => {
    expect(deactivationBlocker({ otherActiveWarehouses: 1, productsWithStock: 0 })).toBeNull();
  });

  it('refuses while the warehouse holds stock', () => {
    expect(deactivationBlocker({ otherActiveWarehouses: 3, productsWithStock: 2 })).toMatch(
      /still holds stock for 2 product/,
    );
  });

  it('refuses deactivating the last active warehouse', () => {
    expect(deactivationBlocker({ otherActiveWarehouses: 0, productsWithStock: 0 })).toMatch(
      /At least one warehouse/,
    );
  });
});
