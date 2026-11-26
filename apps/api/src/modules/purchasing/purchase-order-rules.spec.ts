import {
  MONEY_DECIMALS,
  canCancel,
  canReceive,
  canConfirm,
  canEdit,
  lineAmounts,
  nextSupplierCode,
  orderTotals,
  receiptLineAmounts,
  statusAfterReceipt,
  weightedAverageCost,
} from './purchase-order-rules';

describe('lineAmounts', () => {
  it('keeps amounts to the millime (Tunisian dinar, 3 decimals)', () => {
    expect(MONEY_DECIMALS).toBe(3);
  });

  it('computes gross, discount, net and tax', () => {
    const a = lineAmounts('10', '2.5', '10', '19');
    expect(a.gross.toFixed(3)).toBe('25.000');
    expect(a.discount.toFixed(3)).toBe('2.500');
    expect(a.net.toFixed(3)).toBe('22.500');
    expect(a.tax.toFixed(3)).toBe('4.275'); // exact to the millime, not rounded to 4.28
  });

  it('rounds each part half up to the millime', () => {
    const a = lineAmounts('1', '1.2345', '0', '19');
    expect(a.gross.toFixed(3)).toBe('1.235'); // 1.2345
    expect(a.tax.toFixed(3)).toBe('0.235'); // 0.23465
  });

  it('rounds the gross with 4-decimal quantities and prices', () => {
    const a = lineAmounts('3.3333', '1.2345', '0', '0');
    expect(a.gross.toFixed(3)).toBe('4.115'); // 4.11495885
    expect(a.tax.toFixed(3)).toBe('0.000');
  });

  it('gives a zero net for a 100 % discount', () => {
    const a = lineAmounts('4', '9.99', '100', '19');
    expect(a.net.toFixed(3)).toBe('0.000');
    expect(a.tax.toFixed(3)).toBe('0.000');
  });
});

describe('orderTotals', () => {
  it('sums the rounded line parts so the total matches the lines', () => {
    const lines = [lineAmounts('10', '2.5', '10', '19'), lineAmounts('1', '0.333', '0', '7')];
    const t = orderTotals(lines);
    expect(t.subtotal.toFixed(3)).toBe('25.333');
    expect(t.discountTotal.toFixed(3)).toBe('2.500');
    expect(t.taxTotal.toFixed(3)).toBe('4.298'); // 4.275 + 0.023
    expect(t.total.toFixed(3)).toBe('27.131');
  });

  it('is zero for no lines', () => {
    expect(orderTotals([]).total.toFixed(3)).toBe('0.000');
  });
});

describe('status rules', () => {
  it('edits and confirms drafts only', () => {
    expect(canEdit('DRAFT')).toBe(true);
    expect(canEdit('CONFIRMED')).toBe(false);
    expect(canConfirm('DRAFT')).toBe(true);
    expect(canConfirm('CANCELLED')).toBe(false);
  });

  it('cancels drafts, and confirmed orders with nothing received', () => {
    expect(canCancel('DRAFT', false)).toBe(true);
    expect(canCancel('CONFIRMED', false)).toBe(true);
    expect(canCancel('CONFIRMED', true)).toBe(false);
    expect(canCancel('PARTIALLY_RECEIVED', true)).toBe(false);
    expect(canCancel('RECEIVED', true)).toBe(false);
    expect(canCancel('CANCELLED', false)).toBe(false);
  });
});

describe('nextSupplierCode', () => {
  it('starts at SUP-00001', () => expect(nextSupplierCode(null)).toBe('SUP-00001'));
  it('follows the highest number', () => expect(nextSupplierCode(41)).toBe('SUP-00042'));
  it('grows past 5 digits', () => expect(nextSupplierCode(99999)).toBe('SUP-100000'));
});

describe('goods receipt rules', () => {
  it('receives confirmed and partially received orders only', () => {
    expect(canReceive('CONFIRMED')).toBe(true);
    expect(canReceive('PARTIALLY_RECEIVED')).toBe(true);
    expect(canReceive('DRAFT')).toBe(false);
    expect(canReceive('RECEIVED')).toBe(false);
    expect(canReceive('CANCELLED')).toBe(false);
  });

  it('values a carton line at the order price after discount, per base unit', () => {
    // 2 cartons of 24 at 36.000 with 10 % off
    const a = receiptLineAmounts('2', '36', '10', '24');
    expect(a.baseQuantity.toFixed(4)).toBe('48.0000');
    expect(a.unitCost.toFixed(4)).toBe('1.3500'); // 32.4 / 24
    expect(a.value.toFixed(3)).toBe('64.800');
  });

  it('keeps the cost to 4 decimals', () => {
    const a = receiptLineAmounts('1', '10', '0', '3');
    expect(a.unitCost.toFixed(4)).toBe('3.3333');
    expect(a.value.toFixed(3)).toBe('10.000');
  });

  it('computes the weighted average cost', () => {
    // 10 on hand at 2.000, 30 received at 3.000 → (20 + 90) / 40
    expect(weightedAverageCost('10', '2', '30', '3').toFixed(4)).toBe('2.7500');
  });

  it('takes the receipt cost when there is no stock', () => {
    expect(weightedAverageCost('0', '5', '12', '1.35').toFixed(4)).toBe('1.3500');
    expect(weightedAverageCost('-4', '5', '12', '1.35').toFixed(4)).toBe('1.3500');
  });

  it('is fully received only when every line is complete', () => {
    expect(
      statusAfterReceipt([
        { quantity: '10', receivedQty: '10' },
        { quantity: '5', receivedQty: '2' },
      ]),
    ).toBe('PARTIALLY_RECEIVED');
    expect(
      statusAfterReceipt([
        { quantity: '10', receivedQty: '10' },
        { quantity: '5', receivedQty: '5' },
      ]),
    ).toBe('RECEIVED');
  });
});
