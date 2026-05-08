const nightStalker = require('./nightStalker');
const PilotState = require('../services/pilotState');

const KILL_EVENT = { type: 'kill_enrichment', playerUcid: 'pilot-1', playerName: 'Maverick' };

function stateWith(kills) {
  const state = new PilotState();
  state.kills = kills;
  return state;
}

describe('NightStalker — metadata', () => {
  it('has id night_stalker', () => {
    expect(nightStalker.id).toBe('night_stalker');
  });

  it('has triggerType kill_enrichment', () => {
    expect(nightStalker.triggerType).toBe('kill_enrichment');
  });
});

describe('NightStalker — evaluate', () => {
  it('returns true for a night air kill', () => {
    expect(nightStalker.evaluate(KILL_EVENT, stateWith([
      { victimUnitCategory: 'air', night: true },
    ]))).toBe(true);
  });

  it('returns false for a day air kill', () => {
    expect(nightStalker.evaluate(KILL_EVENT, stateWith([
      { victimUnitCategory: 'air', night: false },
    ]))).toBe(false);
  });

  it('returns false when night is null', () => {
    expect(nightStalker.evaluate(KILL_EVENT, stateWith([
      { victimUnitCategory: 'air', night: null },
    ]))).toBe(false);
  });

  it('returns false for a night ground kill', () => {
    expect(nightStalker.evaluate(KILL_EVENT, stateWith([
      { victimUnitCategory: 'ground', night: true },
    ]))).toBe(false);
  });

  it('returns false with no kills', () => {
    expect(nightStalker.evaluate(KILL_EVENT, stateWith([]))).toBe(false);
  });

  it('evaluates only the most recent kill', () => {
    const state = stateWith([
      { victimUnitCategory: 'air', night: false },
      { victimUnitCategory: 'air', night: true },
    ]);
    expect(nightStalker.evaluate(KILL_EVENT, state)).toBe(true);
  });

  it('returns false when the most recent kill is not at night', () => {
    const state = stateWith([
      { victimUnitCategory: 'air', night: true },
      { victimUnitCategory: 'air', night: false },
    ]);
    expect(nightStalker.evaluate(KILL_EVENT, state)).toBe(false);
  });
});

describe('NightStalker — via applyKill', () => {
  it('captures night flag from kill event', () => {
    const state = new PilotState();
    state.applyKill({ victimUnitCategory: 'air', night: true, victimRoles: [], killedAtMs: 1000 });
    expect(nightStalker.evaluate(KILL_EVENT, state)).toBe(true);
  });

  it('returns false when kill event has night: false', () => {
    const state = new PilotState();
    state.applyKill({ victimUnitCategory: 'air', night: false, victimRoles: [], killedAtMs: 1000 });
    expect(nightStalker.evaluate(KILL_EVENT, state)).toBe(false);
  });
});
