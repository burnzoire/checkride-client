const splashOne = require('./splashOne');
const PilotState = require('../services/pilotState');

const KILL_EVENT = { type: 'kill_enrichment', playerUcid: 'pilot-1', playerName: 'Maverick' };

function stateWith(kills) {
  const state = new PilotState();
  state.kills = kills;
  return state;
}

describe('SplashOne — metadata', () => {
  it('has id splash_one', () => {
    expect(splashOne.id).toBe('splash_one');
  });

  it('has triggerType kill_enrichment', () => {
    expect(splashOne.triggerType).toBe('kill_enrichment');
  });
});

describe('SplashOne — evaluate', () => {
  it('returns true on the first air kill', () => {
    expect(splashOne.evaluate(KILL_EVENT, stateWith([
      { victimUnitCategory: 'air' },
    ]))).toBe(true);
  });

  it('returns true when multiple air kills exist', () => {
    expect(splashOne.evaluate(KILL_EVENT, stateWith([
      { victimUnitCategory: 'air' },
      { victimUnitCategory: 'air' },
    ]))).toBe(true);
  });

  it('returns false with no kills', () => {
    expect(splashOne.evaluate(KILL_EVENT, stateWith([]))).toBe(false);
  });

  it('returns false with only ground kills', () => {
    expect(splashOne.evaluate(KILL_EVENT, stateWith([
      { victimUnitCategory: 'ground' },
    ]))).toBe(false);
  });
});
