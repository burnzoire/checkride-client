const Achievement = require('./achievement');

function makeAchievement(overrides = {}) {
  return new Achievement({
    id: 'test_achievement',
    name: 'Test Achievement',
    description: 'Do something impressive',
    ...overrides,
  });
}

describe('Achievement — message', () => {
  it('includes pilot name and achievement name', () => {
    const achievement = makeAchievement();
    expect(achievement.message('Maverick')).toBe('Maverick earned "Test Achievement" — Do something impressive');
  });
});

describe('Achievement — personalMessage', () => {
  it('returns name and description prefixed with checkmark', () => {
    const achievement = makeAchievement();
    expect(achievement.personalMessage()).toBe('[✓] "Test Achievement" — Do something impressive');
  });
});

describe('Achievement — evaluate', () => {
  it('throws when not implemented', () => {
    const achievement = makeAchievement();
    expect(() => achievement.evaluate({}, {})).toThrow('Achievement "test_achievement" must implement evaluate(event, state)');
  });
});
