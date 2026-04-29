const sureShot = require('./sureShot');
const PilotState = require('../services/pilotState');

function killEvent(overrides = {}) {
  return {
    type: 'kill_enrichment',
    playerUcid: 'pilot-1',
    playerName: 'Maverick',
    victimUnitCategory: 'air',
    victimObjectId: 55,
    weaponClass: 'AAM',
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

  it('has triggerType kill_enrichment', () => {
    expect(sureShot.triggerType).toBe('kill_enrichment');
  });
});

describe('SureShot — evaluate', () => {
  it('returns true when exactly 1 AAM fired and kill event carries weaponClass AAM', () => {
    const state = stateWith({ aamFiredCount: 1 });
    expect(sureShot.evaluate(killEvent(), state)).toBe(true);
  });

  it('returns false when no AAMs have been fired', () => {
    const state = stateWith({ aamFiredCount: 0 });
    expect(sureShot.evaluate(killEvent(), state)).toBe(false);
  });

  it('returns false when more than one AAM has been fired', () => {
    const state = stateWith({ aamFiredCount: 2 });
    expect(sureShot.evaluate(killEvent(), state)).toBe(false);
  });

  it('returns false when victim is a ground unit', () => {
    const state = stateWith({ aamFiredCount: 1 });
    expect(sureShot.evaluate(killEvent({ victimUnitCategory: 'ground' }), state)).toBe(false);
  });

  it('returns false when victim is a ship', () => {
    const state = stateWith({ aamFiredCount: 1 });
    expect(sureShot.evaluate(killEvent({ victimUnitCategory: 'ship' }), state)).toBe(false);
  });

  it('returns false when kill event has no weaponClass (no hit record — gun or unknown)', () => {
    const state = stateWith({ aamFiredCount: 1 });
    expect(sureShot.evaluate(killEvent({ weaponClass: null }), state)).toBe(false);
  });

  it('returns false when kill was from a bomb, not an AAM', () => {
    const state = stateWith({ aamFiredCount: 1 });
    expect(sureShot.evaluate(killEvent({ weaponClass: 'BOMB' }), state)).toBe(false);
  });

  it('awards correctly even when hit_enrichment has not yet updated missile state (ordering race)', () => {
    // This is the key regression test: kill_enrichment arrives before hit_enrichment.
    // Before the fix, state.missiles would still show in_flight and the award was missed.
    const state = stateWith({ aamFiredCount: 1 });
    // missiles intentionally empty — hit_enrichment hasn't arrived yet
    expect(sureShot.evaluate(killEvent(), state)).toBe(true);
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
