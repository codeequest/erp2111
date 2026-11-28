import { applyMove, D, lockOrder, moveLineError } from './stock-rules';

const state = (onHand: string, avgCost: string) => ({ onHand: D(onHand), avgCost: D(avgCost) });

describe('applyMove (weighted average cost)', () => {
  it('blends a receipt with the existing stock', () => {
    // 10 @ 5.00 + 30 @ 7.00 = 40 @ 6.50
    const r = applyMove(state('10', '5'), '30', '7');
    expect(r.onHand.toString()).toBe('40');
    expect(r.avgCost.toString()).toBe('6.5');
    expect(r.unitCost.toString()).toBe('7');
  });

  it('rounds the average to 4 decimals', () => {
    // (1 x 1 + 2 x 2) / 3 = 1.66666... -> 1.6667
    expect(applyMove(state('1', '1'), '2', '2').avgCost.toString()).toBe('1.6667');
  });

  it('uses the receipt cost when there was no stock', () => {
    const r = applyMove(state('0', '9.99'), '5', '4');
    expect(r.avgCost.toString()).toBe('4');
  });

  it('uses the receipt cost when stock was negative (no division by zero)', () => {
    expect(applyMove(state('-5', '3'), '5', '4').avgCost.toString()).toBe('4');
    expect(applyMove(state('-8', '3'), '5', '4').avgCost.toString()).toBe('4');
  });

  it('sends stock out at the current average without changing it', () => {
    const r = applyMove(state('40', '6.5'), '-15');
    expect(r.onHand.toString()).toBe('25');
    expect(r.unitCost.toString()).toBe('6.5');
    expect(r.avgCost.toString()).toBe('6.5');
  });

  it('brings stock in without a cost at the current average (transfer in)', () => {
    const r = applyMove(state('25', '6.5'), '10');
    expect(r.unitCost.toString()).toBe('6.5');
    expect(r.avgCost.toString()).toBe('6.5');
  });

  it('accepts a zero cost (free goods) and lowers the average', () => {
    expect(applyMove(state('10', '6'), '10', '0').avgCost.toString()).toBe('3');
  });
});

describe('moveLineError', () => {
  it('accepts valid lines', () => {
    expect(moveLineError({ type: 'RECEIPT', quantity: '5', unitCost: '2' })).toBeNull();
    expect(moveLineError({ type: 'DELIVERY', quantity: '-5' })).toBeNull();
    expect(moveLineError({ type: 'ADJUSTMENT', quantity: '-1', reason: 'Broken' })).toBeNull();
    expect(moveLineError({ type: 'ADJUSTMENT', quantity: '3' }, 'Found in back room')).toBeNull();
  });

  it('refuses zero and too precise quantities', () => {
    expect(moveLineError({ type: 'DELIVERY', quantity: '0' })).toMatch(/zero/);
    expect(moveLineError({ type: 'DELIVERY', quantity: '-1.00001' })).toMatch(/decimals/);
  });

  it('checks the sign of each move type', () => {
    expect(moveLineError({ type: 'RECEIPT', quantity: '-5', unitCost: '1' })).toMatch(/add stock/);
    expect(moveLineError({ type: 'DELIVERY', quantity: '5' })).toMatch(/remove stock/);
    expect(moveLineError({ type: 'TRANSFER_OUT', quantity: '5' })).toMatch(/remove stock/);
  });

  it('requires a cost for receipts, opening stock and customer returns', () => {
    expect(moveLineError({ type: 'RECEIPT', quantity: '5' })).toMatch(/unit cost/);
    expect(moveLineError({ type: 'OPENING', quantity: '5' })).toMatch(/unit cost/);
    expect(moveLineError({ type: 'CUSTOMER_RETURN', quantity: '5' })).toMatch(/unit cost/);
  });

  it('refuses a cost on outgoing stock, transfers in and negative costs', () => {
    expect(moveLineError({ type: 'DELIVERY', quantity: '-5', unitCost: '1' })).toMatch(/only allowed/);
    expect(moveLineError({ type: 'TRANSFER_IN', quantity: '5', unitCost: '1' })).toMatch(/transfer/);
    expect(moveLineError({ type: 'RECEIPT', quantity: '5', unitCost: '-1' })).toMatch(/zero or more/);
  });

  it('requires a reason for adjustments', () => {
    expect(moveLineError({ type: 'ADJUSTMENT', quantity: '-1' })).toMatch(/reason/);
    expect(moveLineError({ type: 'ADJUSTMENT', quantity: '-1', reason: '  ' })).toMatch(/reason/);
  });

  it('lets reversals use the opposite sign of their type', () => {
    expect(moveLineError({ type: 'RECEIPT', quantity: '-5', reversesMoveId: 'x' })).toBeNull();
    expect(moveLineError({ type: 'DELIVERY', quantity: '5', unitCost: '2', reversesMoveId: 'x' })).toBeNull();
  });
});

describe('lockOrder', () => {
  it('sorts by product id and keeps the original order inside a product', () => {
    const lines = [
      { productId: 'b', n: 1 },
      { productId: 'a', n: 2 },
      { productId: 'b', n: 3 },
      { productId: 'a', n: 4 },
    ];
    expect(lockOrder(lines).map((l) => l.n)).toEqual([2, 4, 1, 3]);
  });
});
