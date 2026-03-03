const textbookTrap = require('./textbookTrap');

function gradingEvent(overrides = {}) {
  return {
    type: 'grading',
    playerUcid: 'pilot-1',
    playerName: 'Maverick',
    lsoGrade: 'OK',
    wire: 3,
    night: false,
    fuelState: null,
    ...overrides,
  };
}

describe('TextbookTrap — metadata', () => {
  it('has id textbook_trap', () => {
    expect(textbookTrap.id).toBe('textbook_trap');
  });

  it('has triggerType grading', () => {
    expect(textbookTrap.triggerType).toBe('grading');
  });
});

describe('TextbookTrap — evaluate', () => {
  it('returns true for _OK_ and 3-wire', () => {
    expect(textbookTrap.evaluate(gradingEvent({ lsoGrade: '_OK_', wire: 3 }), null)).toBe(true);
  });

  it('returns false for _OK_ on non-3-wire', () => {
    expect(textbookTrap.evaluate(gradingEvent({ lsoGrade: '_OK_', wire: 2 }), null)).toBe(false);
  });

  it('returns false for 3-wire without _OK_ grade', () => {
    expect(textbookTrap.evaluate(gradingEvent({ lsoGrade: 'OK', wire: 3 }), null)).toBe(false);
  });

  it('returns false for non-3-wire and non-_OK_ grade', () => {
    expect(textbookTrap.evaluate(gradingEvent({ lsoGrade: 'B', wire: null }), null)).toBe(false);
  });
});
