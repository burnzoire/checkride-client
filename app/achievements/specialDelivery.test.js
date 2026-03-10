const specialDelivery = require('./specialDelivery');

describe('SpecialDelivery - metadata', () => {
  it('has id special_delivery', () => {
    expect(specialDelivery.id).toBe('special_delivery');
  });

  it('has triggerType hit_enrichment', () => {
    expect(specialDelivery.triggerType).toBe('hit_enrichment');
  });
});

describe('SpecialDelivery - evaluate', () => {
  it('returns true when longest missile hit is beyond 45nm', () => {
    const state = { longestMissileHit: 45.1 };
    const result = specialDelivery.evaluate({ type: 'hit_enrichment' }, state);
    expect(result).toBe(true);
  });

  it('returns false at exactly 45nm', () => {
    const state = { longestMissileHit: 45 };
    const result = specialDelivery.evaluate({ type: 'hit_enrichment' }, state);
    expect(result).toBe(false);
  });

  it('returns false below threshold', () => {
    const state = { longestMissileHit: 18.7 };
    const result = specialDelivery.evaluate({ type: 'hit_enrichment' }, state);
    expect(result).toBe(false);
  });

  it('returns false when no missile hit value is available', () => {
    const state = { longestMissileHit: null };
    const result = specialDelivery.evaluate({ type: 'hit_enrichment' }, state);
    expect(result).toBe(false);
  });
});
