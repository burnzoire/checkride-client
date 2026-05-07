const instantAce = require('./instantAce');
const PilotState = require('../services/pilotState');

const KILL_EVENT = { type: 'kill_enrichment', playerUcid: 'pilot-1', playerName: 'Maverick' };

function airKills(n) {
  return Array.from({ length: n }, () => ({ victimUnitCategory: 'air' }));
}

function stateWith(kills) {
  const state = new PilotState();
  state.kills = kills;
  return state;
}

describe('InstantAce — metadata', () => {
  it('has id instant_ace', () => {
    expect(instantAce.id).toBe('instant_ace');
  });

  it('has triggerType kill_enrichment', () => {
    expect(instantAce.triggerType).toBe('kill_enrichment');
  });
});

describe('InstantAce — evaluate', () => {
  it('returns true at exactly 5 air kills', () => {
    expect(instantAce.evaluate(KILL_EVENT, stateWith(airKills(5)))).toBe(true);
  });

  it('returns true above 5 air kills', () => {
    expect(instantAce.evaluate(KILL_EVENT, stateWith(airKills(7)))).toBe(true);
  });

  it('returns false with 4 air kills', () => {
    expect(instantAce.evaluate(KILL_EVENT, stateWith(airKills(4)))).toBe(false);
  });

  it('returns false with no kills', () => {
    expect(instantAce.evaluate(KILL_EVENT, stateWith([]))).toBe(false);
  });

  it('does not count ground kills toward the total', () => {
    const state = stateWith([
      ...airKills(4),
      { victimUnitCategory: 'ground' },
    ]);
    expect(instantAce.evaluate(KILL_EVENT, state)).toBe(false);
  });
});
