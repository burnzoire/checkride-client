const foxFour = require('./foxFour');
const PilotState = require('../services/pilotState');

const KILL_EVENT = { type: 'kill_enrichment', playerUcid: 'pilot-1', playerName: 'Maverick' };

function stateWith(kills) {
  const state = new PilotState();
  state.kills = kills;
  return state;
}

describe('FoxFour — metadata', () => {
  it('has id fox_four', () => {
    expect(foxFour.id).toBe('fox_four');
  });

  it('has triggerType kill_enrichment', () => {
    expect(foxFour.triggerType).toBe('kill_enrichment');
  });
});

describe('FoxFour — evaluate', () => {
  it('returns true for an air kill with weaponClass COLLISION', () => {
    expect(foxFour.evaluate(KILL_EVENT, stateWith([
      { victimUnitCategory: 'air', weaponClass: 'COLLISION' },
    ]))).toBe(true);
  });

  it('returns false for an air kill with a missile', () => {
    expect(foxFour.evaluate(KILL_EVENT, stateWith([
      { victimUnitCategory: 'air', weaponClass: 'AAM' },
    ]))).toBe(false);
  });

  it('returns false for an air kill with null weaponClass (no-hit-record, not a collision)', () => {
    expect(foxFour.evaluate(KILL_EVENT, stateWith([
      { victimUnitCategory: 'air', weaponClass: null },
    ]))).toBe(false);
  });

  it('returns false for a ground unit killed via collision', () => {
    expect(foxFour.evaluate(KILL_EVENT, stateWith([
      { victimUnitCategory: 'ground', weaponClass: 'COLLISION' },
    ]))).toBe(false);
  });

  it('returns false with no kills', () => {
    expect(foxFour.evaluate(KILL_EVENT, stateWith([]))).toBe(false);
  });

  it('evaluates only the most recent kill', () => {
    const state = stateWith([
      { victimUnitCategory: 'air', weaponClass: 'AAM' },
      { victimUnitCategory: 'air', weaponClass: 'COLLISION' },
    ]);
    expect(foxFour.evaluate(KILL_EVENT, state)).toBe(true);
  });

  it('returns false when the most recent kill does not qualify even if a prior one would', () => {
    const state = stateWith([
      { victimUnitCategory: 'air', weaponClass: 'COLLISION' },
      { victimUnitCategory: 'air', weaponClass: 'AAM' },
    ]);
    expect(foxFour.evaluate(KILL_EVENT, state)).toBe(false);
  });
});
