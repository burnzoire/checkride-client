const soHighRightNow = require('./soHighRightNow');

describe('SoHighRightNow - metadata', () => {
  it('has id so_high_right_now', () => {
    expect(soHighRightNow.id).toBe('so_high_right_now');
  });

  it('has triggerType flight_sample_enrichment', () => {
    expect(soHighRightNow.triggerType).toBe('flight_sample_enrichment');
  });
});

describe('SoHighRightNow - evaluate', () => {
  it('returns true at exactly 50000 ft', () => {
    const state = { highestAltitudeFt: 50000 };
    const result = soHighRightNow.evaluate({ type: 'flight_sample_enrichment' }, state);
    expect(result).toBe(true);
  });

  it('returns true above 50000 ft', () => {
    const state = { highestAltitudeFt: 52500 };
    const result = soHighRightNow.evaluate({ type: 'flight_sample_enrichment' }, state);
    expect(result).toBe(true);
  });

  it('returns false below 50000 ft', () => {
    const state = { highestAltitudeFt: 49999 };
    const result = soHighRightNow.evaluate({ type: 'flight_sample_enrichment' }, state);
    expect(result).toBe(false);
  });

  it('returns false when altitude is unavailable', () => {
    const state = { highestAltitudeFt: null };
    const result = soHighRightNow.evaluate({ type: 'flight_sample_enrichment' }, state);
    expect(result).toBe(false);
  });
});
