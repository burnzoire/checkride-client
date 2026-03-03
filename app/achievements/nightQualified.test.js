const nightQualified = require('./nightQualified');

describe('NightQualified — metadata', () => {
  it('has id night_qualified', () => {
    expect(nightQualified.id).toBe('night_qualified');
  });

  it('has triggerType grading', () => {
    expect(nightQualified.triggerType).toBe('grading');
  });
});

describe('NightQualified — evaluate', () => {
  it('returns false below threshold', () => {
    expect(nightQualified.evaluate(null, { nightTrapCount: 1 })).toBe(false);
  });

  it('returns true at threshold', () => {
    expect(nightQualified.evaluate(null, { nightTrapCount: 2 })).toBe(true);
  });

  it('returns true above threshold', () => {
    expect(nightQualified.evaluate(null, { nightTrapCount: 4 })).toBe(true);
  });
});
