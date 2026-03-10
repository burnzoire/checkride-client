const speedIsLife = require('./speedIsLife');

describe('SpeedIsLife - metadata', () => {
  it('has id speed_is_life', () => {
    expect(speedIsLife.id).toBe('speed_is_life');
  });

  it('has triggerType flight_sample_enrichment', () => {
    expect(speedIsLife.triggerType).toBe('flight_sample_enrichment');
  });
});

describe('SpeedIsLife - evaluate', () => {
  it('returns true at exactly Mach 2.0', () => {
    const state = { highestSpeedMach: 2.0 };
    const result = speedIsLife.evaluate({ type: 'flight_sample_enrichment' }, state);
    expect(result).toBe(true);
  });

  it('returns true above Mach 2.0', () => {
    const state = { highestSpeedMach: 2.25 };
    const result = speedIsLife.evaluate({ type: 'flight_sample_enrichment' }, state);
    expect(result).toBe(true);
  });

  it('returns false below Mach 2.0', () => {
    const state = { highestSpeedMach: 1.99 };
    const result = speedIsLife.evaluate({ type: 'flight_sample_enrichment' }, state);
    expect(result).toBe(false);
  });

  it('returns false when speed is unavailable', () => {
    const state = { highestSpeedMach: null };
    const result = speedIsLife.evaluate({ type: 'flight_sample_enrichment' }, state);
    expect(result).toBe(false);
  });
});