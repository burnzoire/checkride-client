const bolterBolter = require('./bolterBolter');

describe('BolterBolter — metadata', () => {
  it('has id bolter_bolter', () => {
    expect(bolterBolter.id).toBe('bolter_bolter');
  });

  it('has triggerType grading', () => {
    expect(bolterBolter.triggerType).toBe('grading');
  });
});

describe('BolterBolter — evaluate', () => {
  it('returns false for one consecutive bolter', () => {
    expect(bolterBolter.evaluate(null, { consecutiveBolters: 1 })).toBe(false);
  });

  it('returns true for two consecutive bolters', () => {
    expect(bolterBolter.evaluate(null, { consecutiveBolters: 2 })).toBe(true);
  });

  it('returns true above threshold', () => {
    expect(bolterBolter.evaluate(null, { consecutiveBolters: 4 })).toBe(true);
  });
});
