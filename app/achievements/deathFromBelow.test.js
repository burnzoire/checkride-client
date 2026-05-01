const deathFromBelow = require('./deathFromBelow');
const PilotState = require('../services/pilotState');

function killEvent(overrides = {}) {
  return { type: 'kill_enrichment', playerUcid: 'pilot-1', ...overrides };
}

function stateWithKills(kills) {
  const state = new PilotState();
  state.kills = kills;
  return state;
}

describe('DeathFromBelow — metadata', () => {
  it('has id death_from_below', () => {
    expect(deathFromBelow.id).toBe('death_from_below');
  });

  it('has triggerType kill_enrichment', () => {
    expect(deathFromBelow.triggerType).toBe('kill_enrichment');
  });
});

describe('DeathFromBelow — evaluate', () => {
  it('returns true for a helo killing a fixed-wing', () => {
    const state = stateWithKills([{ killerUnitCategory: 'HELICOPTER', victimAirType: 'AIRPLANE' }]);
    expect(deathFromBelow.evaluate(killEvent(), state)).toBe(true);
  });

  it('returns false for a helo killing another helicopter', () => {
    const state = stateWithKills([{ killerUnitCategory: 'HELICOPTER', victimAirType: 'HELICOPTER' }]);
    expect(deathFromBelow.evaluate(killEvent(), state)).toBe(false);
  });

  it('returns false for a helo ground kill', () => {
    const state = stateWithKills([{ killerUnitCategory: 'HELICOPTER', victimAirType: null }]);
    expect(deathFromBelow.evaluate(killEvent(), state)).toBe(false);
  });

  it('returns false for an airplane killing a fixed-wing', () => {
    const state = stateWithKills([{ killerUnitCategory: 'AIRPLANE', victimAirType: 'AIRPLANE' }]);
    expect(deathFromBelow.evaluate(killEvent(), state)).toBe(false);
  });

  it('returns true if any kill in a multi-kill sortie qualifies', () => {
    const state = stateWithKills([
      { killerUnitCategory: 'HELICOPTER', victimAirType: null },
      { killerUnitCategory: 'HELICOPTER', victimAirType: 'AIRPLANE' },
    ]);
    expect(deathFromBelow.evaluate(killEvent(), state)).toBe(true);
  });

  it('returns false with empty kills', () => {
    const state = stateWithKills([]);
    expect(deathFromBelow.evaluate(killEvent(), state)).toBe(false);
  });
});
