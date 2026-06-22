const doubleKill = require('./doubleKill');
const PilotState = require('../services/pilotState');

const KILL_EVENT = { type: 'kill_enrichment', playerUcid: 'pilot-1', playerName: 'Maverick' };

function armourKill(killedAtMs, role = 'Tanks') {
  return { victimUnitCategory: 'ground', victimRoles: [role], killedAtMs };
}

function stateWith(kills) {
  const state = new PilotState();
  state.kills = kills;
  return state;
}

describe('DoubleKill — metadata', () => {
  it('has id double_kill', () => {
    expect(doubleKill.id).toBe('double_kill');
  });

  it('has triggerType kill_enrichment', () => {
    expect(doubleKill.triggerType).toBe('kill_enrichment');
  });
});

describe('DoubleKill — evaluate', () => {
  it('returns true when two armour kills share the same killedAtMs', () => {
    const state = stateWith([armourKill(1200.5), armourKill(1200.5)]);
    expect(doubleKill.evaluate(KILL_EVENT, state)).toBe(true);
  });

  it('returns true when two armour kills are within the 0.1s grace window', () => {
    const state = stateWith([armourKill(1200.5), armourKill(1200.6)]);
    expect(doubleKill.evaluate(KILL_EVENT, state)).toBe(true);
  });

  it('returns true at exactly the 0.1s boundary', () => {
    const state = stateWith([armourKill(1200.5), armourKill(1200.6)]);
    expect(doubleKill.evaluate(KILL_EVENT, state)).toBe(true);
  });

  it('returns false when two armour kills are just outside the 0.1s window', () => {
    const state = stateWith([armourKill(1200.5), armourKill(1200.61)]);
    expect(doubleKill.evaluate(KILL_EVENT, state)).toBe(false);
  });

  it('returns true when three armour kills are within the window', () => {
    const state = stateWith([armourKill(1200.5), armourKill(1200.55), armourKill(1200.6)]);
    expect(doubleKill.evaluate(KILL_EVENT, state)).toBe(true);
  });

  it('returns false when two armour kills are well separated (sequential kills)', () => {
    const state = stateWith([armourKill(1200.5), armourKill(1210.0)]);
    expect(doubleKill.evaluate(KILL_EVENT, state)).toBe(false);
  });

  it('returns false with only one armour kill', () => {
    const state = stateWith([armourKill(1200.5)]);
    expect(doubleKill.evaluate(KILL_EVENT, state)).toBe(false);
  });

  it('returns false with no kills', () => {
    expect(doubleKill.evaluate(KILL_EVENT, stateWith([]))).toBe(false);
  });

  it('does not count air kills toward the pair', () => {
    const state = stateWith([
      armourKill(1200.5),
      { victimUnitCategory: 'air', victimRoles: [], killedAtMs: 1200.5 },
    ]);
    expect(doubleKill.evaluate(KILL_EVENT, state)).toBe(false);
  });

  it('does not count non-armour ground kills toward the pair', () => {
    const state = stateWith([
      armourKill(1200.5),
      { victimUnitCategory: 'ground', victimRoles: ['AAA'], killedAtMs: 1200.5 },
    ]);
    expect(doubleKill.evaluate(KILL_EVENT, state)).toBe(false);
  });

  it('does not count armour kills with null killedAtMs', () => {
    const state = stateWith([
      armourKill(1200.5),
      { victimUnitCategory: 'ground', victimRoles: ['Tanks'], killedAtMs: null },
    ]);
    expect(doubleKill.evaluate(KILL_EVENT, state)).toBe(false);
  });

  it('counts all armour role variants as valid targets', () => {
    const state = stateWith([
      armourKill(1200.5, 'Modern Tanks'),
      armourKill(1200.5, 'IFV'),
    ]);
    expect(doubleKill.evaluate(KILL_EVENT, state)).toBe(true);
  });

  it('does not count the dead "Armour" string (never a real DCS attribute)', () => {
    const state = stateWith([
      armourKill(1200.5, 'Armour'),
      armourKill(1200.5, 'Armour'),
    ]);
    expect(doubleKill.evaluate(KILL_EVENT, state)).toBe(false);
  });

  it('returns true when a simultaneous pair exists among other kills at different times', () => {
    const state = stateWith([
      armourKill(1100.0),          // solo kill earlier
      armourKill(1200.5),          // pair from same bomb
      armourKill(1200.5),
    ]);
    expect(doubleKill.evaluate(KILL_EVENT, state)).toBe(true);
  });
});
