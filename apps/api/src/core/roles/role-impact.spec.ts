import { computeImpact } from './role-impact';

describe('computeImpact', () => {
  it('lists added / removed and the sensitive subset, sorted', () => {
    expect(
      computeImpact(['a', 'admin.user.view'], ['admin.user.view', 'admin.user.deactivate']),
    ).toEqual({
      added: ['admin.user.deactivate'],
      removed: ['a'],
      sensitiveAdded: ['admin.user.deactivate'],
      sensitiveRemoved: [],
    });
  });

  it('ignores duplicates and order', () => {
    expect(computeImpact(['b', 'a', 'a'], ['a', 'b'])).toEqual({
      added: [],
      removed: [],
      sensitiveAdded: [],
      sensitiveRemoved: [],
    });
  });
});
