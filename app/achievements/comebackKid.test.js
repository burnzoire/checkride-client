const comebackKid = require('./comebackKid');

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

describe('ComebackKid — metadata', () => {
  it('has id comeback_kid', () => {
    expect(comebackKid.id).toBe('comeback_kid');
  });

  it('has triggerType grading', () => {
    expect(comebackKid.triggerType).toBe('grading');
  });
});

describe('ComebackKid — evaluate', () => {
  it('returns true when previous pass was bolter and current pass is a trap', () => {
    expect(comebackKid.evaluate(gradingEvent({ lsoGrade: 'OK', wire: 3 }), { prevPassWasBolter: true })).toBe(true);
  });

  it('returns false when previous pass was not a bolter', () => {
    expect(comebackKid.evaluate(gradingEvent({ lsoGrade: 'OK', wire: 3 }), { prevPassWasBolter: false })).toBe(false);
  });

  it('returns false when current pass is another bolter', () => {
    expect(comebackKid.evaluate(gradingEvent({ lsoGrade: 'B', wire: null }), { prevPassWasBolter: true })).toBe(false);
  });

  it('returns false when wire is not finite', () => {
    expect(comebackKid.evaluate(gradingEvent({ lsoGrade: 'OK', wire: null }), { prevPassWasBolter: true })).toBe(false);
  });
});
