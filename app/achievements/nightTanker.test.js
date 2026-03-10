const nightTanker = require('./nightTanker');

describe('NightTanker — metadata', () => {
  it('has id night_tanker', () => {
    expect(nightTanker.id).toBe('night_tanker');
  });

  it('has triggerType refuel_enrichment', () => {
    expect(nightTanker.triggerType).toBe('refuel_enrichment');
  });
});

describe('NightTanker — evaluate', () => {
  it('returns true on night contact_end with >=10% fuel gain', () => {
    const state = { lastRefuelFuelGain: 0.10 };
    const result = nightTanker.evaluate({ contactEvent: 'contact_end', night: true }, state);
    expect(result).toBe(true);
  });

  it('returns false when fuel gain is below threshold', () => {
    const state = { lastRefuelFuelGain: 0.09 };
    const result = nightTanker.evaluate({ contactEvent: 'contact_end', night: true }, state);
    expect(result).toBe(false);
  });

  it('returns false when not a night event', () => {
    const state = { lastRefuelFuelGain: 0.15 };
    const result = nightTanker.evaluate({ contactEvent: 'contact_end', night: false }, state);
    expect(result).toBe(false);
  });
});
