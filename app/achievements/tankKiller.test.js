const tankKiller = require('./tankKiller');
const PilotState = require('../services/pilotState');

const KILL_EVENT = { type: 'kill_enrichment', playerUcid: 'pilot-1', playerName: 'Maverick' };

function armourKill(role = 'Tanks') {
  return { victimUnitCategory: 'ground', victimRoles: [role] };
}

function kills(n, role = 'Tanks') {
  return Array.from({ length: n }, () => armourKill(role));
}

function stateWith(stateKills = []) {
  const state = new PilotState();
  state.kills = stateKills;
  return state;
}

describe('TankKiller — metadata', () => {
  it('has id tank_killer', () => {
    expect(tankKiller.id).toBe('tank_killer');
  });

  it('has triggerType kill_enrichment', () => {
    expect(tankKiller.triggerType).toBe('kill_enrichment');
  });
});

describe('TankKiller — evaluate', () => {
  it('returns true at exactly 10 armour kills', () => {
    expect(tankKiller.evaluate(KILL_EVENT, stateWith(kills(10)))).toBe(true);
  });

  it('returns true when more than 10 armour kills', () => {
    expect(tankKiller.evaluate(KILL_EVENT, stateWith(kills(12)))).toBe(true);
  });

  it('returns false with only 9 armour kills', () => {
    expect(tankKiller.evaluate(KILL_EVENT, stateWith(kills(9)))).toBe(false);
  });

  it('returns false with no kills', () => {
    expect(tankKiller.evaluate(KILL_EVENT, stateWith([]))).toBe(false);
  });

  it('counts Tanks role', () => {
    expect(tankKiller.evaluate(KILL_EVENT, stateWith(kills(10, 'Tanks')))).toBe(true);
  });

  it('counts Modern Tanks role', () => {
    expect(tankKiller.evaluate(KILL_EVENT, stateWith(kills(10, 'Modern Tanks')))).toBe(true);
  });

  it('counts Old Tanks role', () => {
    expect(tankKiller.evaluate(KILL_EVENT, stateWith(kills(10, 'Old Tanks')))).toBe(true);
  });

  it('does not count the dead "Armour" string (never a real DCS attribute)', () => {
    expect(tankKiller.evaluate(KILL_EVENT, stateWith(kills(10, 'Armour')))).toBe(false);
  });

  it('counts IFV role', () => {
    expect(tankKiller.evaluate(KILL_EVENT, stateWith(kills(10, 'IFV')))).toBe(true);
  });

  it('counts APC role', () => {
    expect(tankKiller.evaluate(KILL_EVENT, stateWith(kills(10, 'APC')))).toBe(true);
  });

  it('counts mixed armour roles together', () => {
    const mixed = [
      ...kills(4, 'Tanks'),
      ...kills(3, 'IFV'),
      ...kills(3, 'APC'),
    ];
    expect(tankKiller.evaluate(KILL_EVENT, stateWith(mixed))).toBe(true);
  });

  it('does not count air kills toward the total', () => {
    const state = stateWith([
      ...kills(9, 'Tanks'),
      { victimUnitCategory: 'air', victimRoles: [] },
    ]);
    expect(tankKiller.evaluate(KILL_EVENT, state)).toBe(false);
  });

  it('does not count non-armour ground kills (e.g. AAA)', () => {
    const state = stateWith([
      ...kills(9, 'Tanks'),
      { victimUnitCategory: 'ground', victimRoles: ['AAA'] },
    ]);
    expect(tankKiller.evaluate(KILL_EVENT, state)).toBe(false);
  });

  it('does not count ground kills with empty victimRoles', () => {
    const state = stateWith([
      ...kills(9, 'Tanks'),
      { victimUnitCategory: 'ground', victimRoles: [] },
    ]);
    expect(tankKiller.evaluate(KILL_EVENT, state)).toBe(false);
  });

  it('does not count ground kills with null victimRoles', () => {
    const state = stateWith([
      ...kills(9, 'Tanks'),
      { victimUnitCategory: 'ground', victimRoles: null },
    ]);
    expect(tankKiller.evaluate(KILL_EVENT, state)).toBe(false);
  });
});
