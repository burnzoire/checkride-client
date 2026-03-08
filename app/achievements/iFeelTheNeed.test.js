const iFeelTheNeed = require('./iFeelTheNeed');

describe('IFeelTheNeed - metadata', () => {
  it('has id i_feel_the_need', () => {
    expect(iFeelTheNeed.id).toBe('i_feel_the_need');
  });

  it('has triggerType flight_sample_enrichment', () => {
    expect(iFeelTheNeed.triggerType).toBe('flight_sample_enrichment');
  });
});

describe('IFeelTheNeed - evaluate', () => {
  it('returns true at exactly Mach 1.0', () => {
    const state = { highestSpeedMach: 1.0 };
    const result = iFeelTheNeed.evaluate({ type: 'flight_sample_enrichment' }, state);
    expect(result).toBe(true);
  });

  it('returns true above Mach 1.0', () => {
    const state = { highestSpeedMach: 1.12 };
    const result = iFeelTheNeed.evaluate({ type: 'flight_sample_enrichment' }, state);
    expect(result).toBe(true);
  });

  it('returns false below Mach 1.0', () => {
    const state = { highestSpeedMach: 0.99 };
    const result = iFeelTheNeed.evaluate({ type: 'flight_sample_enrichment' }, state);
    expect(result).toBe(false);
  });

  it('returns false when speed is unavailable', () => {
    const state = { highestSpeedMach: null };
    const result = iFeelTheNeed.evaluate({ type: 'flight_sample_enrichment' }, state);
    expect(result).toBe(false);
  });
});