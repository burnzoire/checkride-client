const shack = require('./shack');
const PilotState = require('../services/pilotState');

const KILL_EVENT = { type: 'kill_enrichment', playerUcid: 'pilot-1', playerName: 'Maverick' };

function stateWith(kills) {
  const state = new PilotState();
  state.kills = kills;
  return state;
}

describe('Shack — metadata', () => {
  it('has id shack', () => {
    expect(shack.id).toBe('shack');
  });

  it('has triggerType kill_enrichment', () => {
    expect(shack.triggerType).toBe('kill_enrichment');
  });
});

describe('Shack — evaluate', () => {
  it('returns true on the first ground kill', () => {
    expect(shack.evaluate(KILL_EVENT, stateWith([
      { victimUnitCategory: 'ground' },
    ]))).toBe(true);
  });

  it('returns true when multiple ground kills exist', () => {
    expect(shack.evaluate(KILL_EVENT, stateWith([
      { victimUnitCategory: 'ground' },
      { victimUnitCategory: 'ground' },
    ]))).toBe(true);
  });

  it('returns false with no kills', () => {
    expect(shack.evaluate(KILL_EVENT, stateWith([]))).toBe(false);
  });

  it('returns false with only air kills', () => {
    expect(shack.evaluate(KILL_EVENT, stateWith([
      { victimUnitCategory: 'air' },
    ]))).toBe(false);
  });
});
