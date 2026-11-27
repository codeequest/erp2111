import {
  averageCostAfterReversal,
  receivableLimit,
  statusAfterCancelledReceipt,
  weightedAverageCost,
} from './purchase-order-rules';
import { billingState } from './goods-receipts.service';
import { Prisma } from '@prisma/client';

const D = (v: string) => new Prisma.Decimal(v);

describe('receivableLimit', () => {
  it('is what is left without tolerance', () => {
    expect(receivableLimit('10', '4', '0').toString()).toBe('6');
  });

  it('adds the tolerance as a % of the ordered quantity', () => {
    expect(receivableLimit('10', '4', '5').toString()).toBe('6.5');
    expect(receivableLimit('10', '10', '5').toString()).toBe('0.5');
  });

  it('is never negative', () => {
    expect(receivableLimit('10', '12', '0').toString()).toBe('0');
  });
});

describe('averageCostAfterReversal', () => {
  it('undoes weightedAverageCost', () => {
    const after = weightedAverageCost('10', '5', '10', '7');
    expect(after.toString()).toBe('6');
    expect(averageCostAfterReversal('20', after, '10', '7').toString()).toBe('5');
  });

  it('keeps the average when nothing would be left', () => {
    expect(averageCostAfterReversal('10', '6', '10', '7').toString()).toBe('6');
  });
});

describe('statusAfterCancelledReceipt', () => {
  it('goes back to confirmed when nothing is received any more', () => {
    expect(statusAfterCancelledReceipt([{ quantity: '5', receivedQty: '0' }])).toBe('CONFIRMED');
  });

  it('stays partly received when other receipts remain', () => {
    expect(
      statusAfterCancelledReceipt([
        { quantity: '5', receivedQty: '2' },
        { quantity: '5', receivedQty: '0' },
      ]),
    ).toBe('PARTIALLY_RECEIVED');
  });
});

describe('billingState', () => {
  it('tells none, partial and full', () => {
    expect(billingState([{ quantity: D('5'), billedQty: D('0') }])).toBe('none');
    expect(billingState([{ quantity: D('5'), billedQty: D('2') }])).toBe('partial');
    expect(
      billingState([
        { quantity: D('5'), billedQty: D('5') },
        { quantity: D('0'), billedQty: D('0') },
      ]),
    ).toBe('full');
  });
});
