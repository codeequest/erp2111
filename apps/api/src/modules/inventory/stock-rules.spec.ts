import { countDelta, netByKey, weightedAverageCost } from './stock-rules';

describe('weightedAverageCost', () => {
  it('blends the old stock and the incoming stock by quantity', () => {
    // 10 on hand at 2.00 + 30 in at 3.00 → (20 + 90) / 40 = 2.75
    expect(weightedAverageCost('10', '2', '30', '3').toFixed(4)).toBe('2.7500');
  });

  it('takes the incoming cost when nothing was on hand', () => {
    expect(weightedAverageCost('0', '5', '12', '1.2').toFixed(4)).toBe('1.2000');
  });

  it('takes the incoming cost when stock was negative', () => {
    expect(weightedAverageCost('-4', '5', '12', '1.2').toFixed(4)).toBe('1.2000');
  });

  it('rounds to 4 decimals', () => {
    // (1 × 1 + 2 × 2) / 3 = 1.6666… → 1.6667
    expect(weightedAverageCost('1', '1', '2', '2').toFixed(4)).toBe('1.6667');
  });

  it('refuses a non-positive incoming quantity', () => {
    expect(() => weightedAverageCost('1', '1', '0', '2')).toThrow();
  });
});

describe('countDelta', () => {
  it('returns counted minus system quantity', () => {
    expect(countDelta('10', '7').toString()).toBe('-3');
    expect(countDelta('-2', '5').toString()).toBe('7');
    expect(countDelta('4.5', '4.5').isZero()).toBe(true);
  });
});

describe('netByKey', () => {
  it('sums signed quantities per key', () => {
    const net = netByKey(
      [
        { k: 'a', q: '5' },
        { k: 'b', q: '1' },
        { k: 'a', q: '-2' },
      ],
      (i) => i.k,
      (i) => i.q,
    );
    expect(net.get('a')?.toString()).toBe('3');
    expect(net.get('b')?.toString()).toBe('1');
  });
});
