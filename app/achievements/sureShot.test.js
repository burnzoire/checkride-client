const sureShot = require('./sureShot');
const PilotState = require('../services/pilotState');

function hitEvent(overrides = {}) {
  return {
    type: 'hit_enrichment',
    playerUcid: 'pilot-1',
    playerName: 'Maverick',
    weaponClass: 'AAM',
    weaponKey: 'w1',
    ...overrides,
  };
}

function stateWith({ aamFiredCount = 0 } = {}) {
  const state = new PilotState();
  state.sortieAamFiredCount = aamFiredCount;
  return state;
}

describe('SureShot — metadata', () => {
  it('has id sure_shot', () => {
    expect(sureShot.id).toBe('sure_shot');
  });

  it('has triggerType hit_enrichment', () => {
    expect(sureShot.triggerType).toBe('hit_enrichment');
  });
});

describe('SureShot — evaluate', () => {
  it('returns true when exactly 1 AAM fired and hit event carries weaponClass AAM', () => {
    const state = stateWith({ aamFiredCount: 1 });
    expect(sureShot.evaluate(hitEvent(), state)).toBe(true);
  });

  it('awards on a non-fatal hit (no kill required)', () => {
    const state = stateWith({ aamFiredCount: 1 });
    expect(sureShot.evaluate(hitEvent(), state)).toBe(true);
  });

  it('returns false when no AAMs have been fired', () => {
    const state = stateWith({ aamFiredCount: 0 });
    expect(sureShot.evaluate(hitEvent(), state)).toBe(false);
  });

  it('returns false when more than one AAM has been fired', () => {
    const state = stateWith({ aamFiredCount: 2 });
    expect(sureShot.evaluate(hitEvent(), state)).toBe(false);
  });

  it('returns false when hit event has no weaponClass', () => {
    const state = stateWith({ aamFiredCount: 1 });
    expect(sureShot.evaluate(hitEvent({ weaponClass: null }), state)).toBe(false);
  });

  it('returns false when hit was from a bomb, not an AAM', () => {
    const state = stateWith({ aamFiredCount: 1 });
    expect(sureShot.evaluate(hitEvent({ weaponClass: 'BOMB' }), state)).toBe(false);
  });
});

describe('SureShot — sortieAamFiredCount integration', () => {
  it('starts at 0', () => {
    expect(new PilotState().sortieAamFiredCount).toBe(0);
  });

  it('increments when a new AAM shot is applied', () => {
    const state = new PilotState();
    state.applyShotEnrichment({
      weaponKey: 'w1',
      weaponClass: 'AAM',
      occurredAt: new Date().toISOString(),
    });
    expect(state.sortieAamFiredCount).toBe(1);
  });

  it('does not increment for a non-AAM weapon', () => {
    const state = new PilotState();
    state.applyShotEnrichment({
      weaponKey: 'w1',
      weaponClass: 'BOMB',
      occurredAt: new Date().toISOString(),
    });
    expect(state.sortieAamFiredCount).toBe(0);
  });

  it('does not double-count an update to an existing in-flight AAM', () => {
    const state = new PilotState();
    const shot = { weaponKey: 'w1', weaponClass: 'AAM', occurredAt: new Date().toISOString() };
    state.applyShotEnrichment(shot);
    state.applyShotEnrichment(shot);
    expect(state.sortieAamFiredCount).toBe(1);
  });

  it('resets on takeoff enrichment', () => {
    const state = new PilotState();
    state.applyShotEnrichment({ weaponKey: 'w1', weaponClass: 'AAM', occurredAt: new Date().toISOString() });
    expect(state.sortieAamFiredCount).toBe(1);
    state.applyTakeoffEnrichment({ launchedFromCarrier: false, occurredAt: new Date().toISOString() });
    expect(state.sortieAamFiredCount).toBe(0);
  });
});
