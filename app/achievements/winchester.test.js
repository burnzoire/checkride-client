const winchester = require('./winchester');
const PilotState = require('../services/pilotState');

const LANDING_EVENT = { type: 'landing', playerUcid: 'pilot-1', playerName: 'Maverick' };

function airKill() {
  return { victimUnitCategory: 'air' };
}

function stateWith({ kills = [], currentPayload = null } = {}) {
  const state = new PilotState();
  state.kills = kills;
  state.currentPayload = currentPayload;
  return state;
}

describe('Winchester — metadata', () => {
  it('has id winchester', () => {
    expect(winchester.id).toBe('winchester');
  });

  it('has triggerType landing', () => {
    expect(winchester.triggerType).toBe('landing');
  });
});

describe('Winchester — evaluate', () => {
  it('returns true when there are kills and all ordnance is expended', () => {
    const state = stateWith({ kills: [airKill()], currentPayload: [] });
    expect(winchester.evaluate(LANDING_EVENT, state)).toBe(true);
  });

  it('returns true when only gun shells remain', () => {
    const state = stateWith({
      kills: [airKill()],
      currentPayload: [{ typeName: 'M-61A1', displayName: 'Vulcan', category: 0, count: 200 }],
    });
    expect(winchester.evaluate(LANDING_EVENT, state)).toBe(true);
  });

  it('returns false when missiles are still on board', () => {
    const state = stateWith({
      kills: [airKill()],
      currentPayload: [{ typeName: 'AIM-9X', displayName: 'Sidewinder', category: 1, count: 1 }],
    });
    expect(winchester.evaluate(LANDING_EVENT, state)).toBe(false);
  });

  it('returns false when there are no kills', () => {
    const state = stateWith({ kills: [], currentPayload: [] });
    expect(winchester.evaluate(LANDING_EVENT, state)).toBe(false);
  });

  it('returns false when currentPayload is null (no telemetry received)', () => {
    const state = stateWith({ kills: [airKill()], currentPayload: null });
    expect(winchester.evaluate(LANDING_EVENT, state)).toBe(false);
  });

  it('returns false when a bomb remains alongside kills', () => {
    const state = stateWith({
      kills: [airKill()],
      currentPayload: [{ typeName: 'GBU-12', displayName: 'Paveway II', category: 3, count: 1 }],
    });
    expect(winchester.evaluate(LANDING_EVENT, state)).toBe(false);
  });

  it('returns false when a rocket remains alongside kills', () => {
    const state = stateWith({
      kills: [airKill()],
      currentPayload: [{ typeName: 'Zuni', displayName: 'Zuni', category: 2, count: 4 }],
    });
    expect(winchester.evaluate(LANDING_EVENT, state)).toBe(false);
  });

  it('returns true with multiple kills and empty payload', () => {
    const state = stateWith({
      kills: [airKill(), { victimUnitCategory: 'ground' }],
      currentPayload: [],
    });
    expect(winchester.evaluate(LANDING_EVENT, state)).toBe(true);
  });
});
