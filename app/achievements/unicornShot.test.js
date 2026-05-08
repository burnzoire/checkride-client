const unicornShot = require('./unicornShot');
const PilotState = require('../services/pilotState');

const KILL_EVENT = { type: 'kill_enrichment', playerUcid: 'pilot-1', playerName: 'Maverick' };

function stateWith(kills) {
  const state = new PilotState();
  state.kills = kills;
  return state;
}

function rocketAirKill(overrides = {}) {
  return {
    victimUnitCategory: 'air',
    weaponClass: 'ROCKET',
    weaponGuidance: 'NONE',
    ...overrides,
  };
}

describe('UnicornShot — metadata', () => {
  it('has id unicorn_shot', () => {
    expect(unicornShot.id).toBe('unicorn_shot');
  });

  it('has triggerType kill_enrichment', () => {
    expect(unicornShot.triggerType).toBe('kill_enrichment');
  });
});

describe('UnicornShot — evaluate', () => {
  it('returns true for an airborne target killed with unguided rockets', () => {
    expect(unicornShot.evaluate(KILL_EVENT, stateWith([rocketAirKill()]))).toBe(true);
  });

  it('returns false when the weapon is guided (not NONE)', () => {
    expect(unicornShot.evaluate(KILL_EVENT, stateWith([rocketAirKill({ weaponGuidance: 'LASER' })]))).toBe(false);
  });

  it('returns false when the target is a ground unit', () => {
    expect(unicornShot.evaluate(KILL_EVENT, stateWith([
      rocketAirKill({ victimUnitCategory: 'ground' }),
    ]))).toBe(false);
  });

  it('returns false when the weapon is a bomb, not a rocket', () => {
    expect(unicornShot.evaluate(KILL_EVENT, stateWith([
      rocketAirKill({ weaponClass: 'BOMB' }),
    ]))).toBe(false);
  });

  it('returns false when the weapon is a missile', () => {
    expect(unicornShot.evaluate(KILL_EVENT, stateWith([
      rocketAirKill({ weaponClass: 'MISSILE' }),
    ]))).toBe(false);
  });

  it('returns false with no kills', () => {
    expect(unicornShot.evaluate(KILL_EVENT, stateWith([]))).toBe(false);
  });

  it('evaluates only the most recent kill', () => {
    const state = stateWith([
      rocketAirKill({ weaponClass: 'MISSILE' }),
      rocketAirKill(),
    ]);
    expect(unicornShot.evaluate(KILL_EVENT, state)).toBe(true);
  });

  it('returns false when the most recent kill does not qualify even if a prior one would', () => {
    const state = stateWith([
      rocketAirKill(),
      rocketAirKill({ weaponClass: 'MISSILE' }),
    ]);
    expect(unicornShot.evaluate(KILL_EVENT, state)).toBe(false);
  });
});
