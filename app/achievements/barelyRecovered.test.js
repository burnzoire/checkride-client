const barelyRecovered = require('./barelyRecovered');

function gradingEvent(overrides = {}) {
  return {
    type: 'grading',
    playerUcid: 'pilot-1',
    playerName: 'Maverick',
    lsoGrade: 'OK',
    wire: 3,
    fuelState: 0.04,
    ...overrides,
  };
}

describe('BarelyRecovered — metadata', () => {
  it('has id barely_recovered', () => {
    expect(barelyRecovered.id).toBe('barely_recovered');
  });

  it('has triggerType grading', () => {
    expect(barelyRecovered.triggerType).toBe('grading');
  });
});

describe('BarelyRecovered — evaluate', () => {
  it('returns true when trapped under 5% fuel', () => {
    expect(barelyRecovered.evaluate(gradingEvent({ fuelState: 0.049 }), null)).toBe(true);
  });

  it('returns false at exactly 5% fuel', () => {
    expect(barelyRecovered.evaluate(gradingEvent({ fuelState: 0.05 }), null)).toBe(false);
  });

  it('returns false when fuelState is missing', () => {
    expect(barelyRecovered.evaluate(gradingEvent({ fuelState: null }), null)).toBe(false);
  });

  it('returns false when no wire is caught', () => {
    expect(barelyRecovered.evaluate(gradingEvent({ wire: null, fuelState: 0.01 }), null)).toBe(false);
  });

  it('returns false for a BOLTER grade', () => {
    expect(barelyRecovered.evaluate(gradingEvent({ lsoGrade: 'BOLTER', wire: null, fuelState: 0.01 }), null)).toBe(false);
  });
});
