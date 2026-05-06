const dropShot = require('./dropShot');
const PilotState = require('../services/pilotState');

const KILL_EVENT = { type: 'kill_enrichment', playerUcid: 'pilot-1', playerName: 'Maverick' };

function stateWith(kills) {
  const state = new PilotState();
  state.kills = kills;
  return state;
}

function heloKill(overrides = {}) {
  return {
    victimUnitCategory: 'air',
    victimAirType: 'HELICOPTER',
    weaponClass: 'BOMB',
    ...overrides,
  };
}

describe('DropShot — metadata', () => {
  it('has id drop_shot', () => {
    expect(dropShot.id).toBe('drop_shot');
  });

  it('has triggerType kill_enrichment', () => {
    expect(dropShot.triggerType).toBe('kill_enrichment');
  });
});

describe('DropShot — evaluate', () => {
  it('returns true for a helicopter killed with a bomb', () => {
    expect(dropShot.evaluate(KILL_EVENT, stateWith([heloKill()]))).toBe(true);
  });

  it('returns false when the target is an airplane, not a helicopter', () => {
    expect(dropShot.evaluate(KILL_EVENT, stateWith([heloKill({ victimAirType: 'AIRPLANE' })]))).toBe(false);
  });

  it('returns false when the weapon is a missile, not a bomb', () => {
    expect(dropShot.evaluate(KILL_EVENT, stateWith([heloKill({ weaponClass: 'MISSILE' })]))).toBe(false);
  });

  it('returns false when the weapon is a rocket', () => {
    expect(dropShot.evaluate(KILL_EVENT, stateWith([heloKill({ weaponClass: 'ROCKET' })]))).toBe(false);
  });

  it('returns false for a ground unit killed with a bomb', () => {
    expect(dropShot.evaluate(KILL_EVENT, stateWith([
      { victimUnitCategory: 'ground', victimAirType: null, weaponClass: 'BOMB' },
    ]))).toBe(false);
  });

  it('returns false with no kills', () => {
    expect(dropShot.evaluate(KILL_EVENT, stateWith([]))).toBe(false);
  });

  it('evaluates only the most recent kill', () => {
    const state = stateWith([
      heloKill({ weaponClass: 'MISSILE' }),
      heloKill({ weaponClass: 'BOMB' }),
    ]);
    expect(dropShot.evaluate(KILL_EVENT, state)).toBe(true);
  });

  it('returns false when the most recent kill does not qualify even if a prior one would', () => {
    const state = stateWith([
      heloKill({ weaponClass: 'BOMB' }),
      heloKill({ weaponClass: 'MISSILE' }),
    ]);
    expect(dropShot.evaluate(KILL_EVENT, state)).toBe(false);
  });
});
