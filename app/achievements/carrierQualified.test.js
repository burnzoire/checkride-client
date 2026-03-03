const carrierQualified = require('./carrierQualified');

describe('CarrierQualified — metadata', () => {
  it('has id carrier_qualified', () => {
    expect(carrierQualified.id).toBe('carrier_qualified');
  });

  it('has triggerType grading', () => {
    expect(carrierQualified.triggerType).toBe('grading');
  });
});

describe('CarrierQualified — evaluate', () => {
  it('returns false below threshold', () => {
    expect(carrierQualified.evaluate(null, { trapCount: 5 })).toBe(false);
  });

  it('returns true at threshold', () => {
    expect(carrierQualified.evaluate(null, { trapCount: 6 })).toBe(true);
  });

  it('returns true above threshold', () => {
    expect(carrierQualified.evaluate(null, { trapCount: 10 })).toBe(true);
  });
});
