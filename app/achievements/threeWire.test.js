const threeWire = require('./threeWire');

function gradingEvent(overrides = {}) {
  return {
    type: 'grading',
    playerUcid: 'pilot-1',
    playerName: 'Maverick',
    lsoGrade: 'OK',
    wire: 3,
    ...overrides,
  };
}

describe('ThreeWire — metadata', () => {
  it('has id three_wire', () => {
    expect(threeWire.id).toBe('three_wire');
  });

  it('has triggerType grading', () => {
    expect(threeWire.triggerType).toBe('grading');
  });
});

describe('ThreeWire — evaluate', () => {
  it('returns true on wire 3', () => {
    expect(threeWire.evaluate(gradingEvent({ wire: 3 }), null)).toBe(true);
  });

  it('returns false on wire 2', () => {
    expect(threeWire.evaluate(gradingEvent({ wire: 2 }), null)).toBe(false);
  });

  it('returns false when no wire is caught', () => {
    expect(threeWire.evaluate(gradingEvent({ wire: null }), null)).toBe(false);
  });
});
