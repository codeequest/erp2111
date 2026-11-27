import {
  agingBucket,
  computeBill,
  daysOverdue,
  defaultDueDate,
  roundMoney,
  statusAfterPayment,
} from './bill-rules';

const s = (v: { toFixed: (d: number) => string }, d = 3) => v.toFixed(d);

describe('roundMoney', () => {
  it('keeps millimes for TND and cents for EUR / USD, half up', () => {
    expect(roundMoney('1.2345', 'TND').toString()).toBe('1.235');
    expect(roundMoney('1.235', 'EUR').toString()).toBe('1.24');
    expect(roundMoney('1.234', 'USD').toString()).toBe('1.23');
  });
});

describe('computeBill', () => {
  it('sums lines with line discounts and VAT, to the millime', () => {
    const bill = computeBill(
      [
        { quantity: '10', unitPrice: '4.250', discountPct: '0', taxRate: '19' },
        { quantity: '3', unitPrice: '12.345', discountPct: '10', taxRate: '7' },
      ],
      { type: null, value: 0 },
      'TND',
    );
    // line 1: 42.500, VAT 8.075 ; line 2: 37.035 − 3.704 = 33.331, VAT 2.333
    expect(s(bill.lines[0].subtotal)).toBe('42.500');
    expect(s(bill.lines[0].tax)).toBe('8.075');
    expect(s(bill.lines[1].lineDiscount)).toBe('3.704');
    expect(s(bill.lines[1].subtotal)).toBe('33.331');
    expect(s(bill.lines[1].tax)).toBe('2.333');
    expect(s(bill.subtotal)).toBe('79.535');
    expect(s(bill.discountTotal)).toBe('3.704');
    expect(s(bill.taxTotal)).toBe('10.408');
    expect(s(bill.total)).toBe('86.239');
  });

  it('spreads a bill discount over the lines before VAT, remainder on the largest line', () => {
    const bill = computeBill(
      [
        { quantity: '1', unitPrice: '100', discountPct: '0', taxRate: '19' },
        { quantity: '1', unitPrice: '50', discountPct: '0', taxRate: '0' },
      ],
      { type: 'AMOUNT', value: '10' },
      'EUR',
    );
    expect(s(bill.lines[0].billDiscount, 2)).toBe('6.67');
    expect(s(bill.lines[1].billDiscount, 2)).toBe('3.33');
    expect(s(bill.lines[0].tax, 2)).toBe('17.73'); // 93.33 × 19 %
    expect(s(bill.discountTotal, 2)).toBe('10.00');
    expect(s(bill.total, 2)).toBe('157.73'); // 150 − 10 + 17.73
  });

  it('never discounts more than the net amount', () => {
    const bill = computeBill(
      [{ quantity: '1', unitPrice: '20', discountPct: '0', taxRate: '19' }],
      { type: 'AMOUNT', value: '50' },
      'USD',
    );
    expect(s(bill.total, 2)).toBe('0.00');
  });

  it('applies a % bill discount', () => {
    const bill = computeBill(
      [{ quantity: '2', unitPrice: '50', discountPct: '0', taxRate: '0' }],
      { type: 'PERCENT', value: '5' },
      'TND',
    );
    expect(s(bill.total)).toBe('95.000');
  });
});

describe('dates and status', () => {
  it('computes the due date from the payment terms', () => {
    expect(defaultDueDate('2026-11-27', 30)).toBe('2026-12-27');
    expect(defaultDueDate('2026-11-27', 0)).toBe('2026-11-27');
  });

  it('counts the days overdue and their bucket', () => {
    expect(daysOverdue('2026-11-20', '2026-11-27')).toBe(7);
    expect(daysOverdue('2026-11-27', '2026-11-27')).toBe(0);
    expect(daysOverdue(null, '2026-11-27')).toBe(0);
    expect(agingBucket(0)).toBe('current');
    expect(agingBucket(30)).toBe('1-30');
    expect(agingBucket(31)).toBe('31-60');
    expect(agingBucket(91)).toBe('90+');
  });

  it('moves to partly paid then paid', () => {
    expect(statusAfterPayment('100', '0')).toBe('POSTED');
    expect(statusAfterPayment('100', '40')).toBe('PARTIALLY_PAID');
    expect(statusAfterPayment('100', '100')).toBe('PAID');
  });
});
