const sureShot = require('./sureShot');
const PilotState = require('../services/pilotState');

function killEvent(overrides = {}) {
  return {
    type: 'kill_enrichment',
    playerUcid: 'pilot-1',
    playerName: 'Maverick',
    victimUnitCategory: 'air',
    victimObjectId: 55,
    ...overrides,
  };
}

function stateWith({ aamFiredCount = 0, missiles = [] } = {}) {
  const state = new PilotState();
  state.sortieAamFiredCount = aamFiredCount;
  state.missiles = missiles;
  return state;
}

function hitMissile(overrides = {}) {
  return { weaponKey: 'w1', weaponClass: 'air_to_air_missile', inFlight: false, status: 'hit', ...overrides };
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
  it('returns true when exactly 1 AAM fired and missile hit scores an air kill', () => {
    const state = stateWith({ aamFiredCount: 1, missiles: [hitMissile()] });
    expect(sureShot.evaluate(killEvent(), state)).toBe(true);
  });

  it('returns false when no AAMs have been fired', () => {
    const state = stateWith({ aamFiredCount: 0, missiles: [] });
    expect(sureShot.evaluate(killEvent(), state)).toBe(false);
  });

  it('returns false when more than one AAM has been fired', () => {
    const state = stateWith({ aamFiredCount: 2, missiles: [hitMissile(), hitMissile({ weaponKey: 'w2' })] });
    expect(sureShot.evaluate(killEvent(), state)).toBe(false);
  });

  it('returns false when victim is a ground unit', () => {
    const state = stateWith({ aamFiredCount: 1, missiles: [hitMissile()] });
    expect(sureShot.evaluate(killEvent({ victimUnitCategory: 'ground' }), state)).toBe(false);
  });

  it('returns false when victim is a ship', () => {
    const state = stateWith({ aamFiredCount: 1, missiles: [hitMissile()] });
    expect(sureShot.evaluate(killEvent({ victimUnitCategory: 'ship' }), state)).toBe(false);
  });

  it('returns false when the AAM missed (status expired)', () => {
    const state = stateWith({
      aamFiredCount: 1,
      missiles: [{ weaponKey: 'w1', weaponClass: 'air_to_air_missile', inFlight: false, status: 'expired' }],
    });
    expect(sureShot.evaluate(killEvent(), state)).toBe(false);
  });

  it('returns false when the AAM is still in flight', () => {
    const state = stateWith({
      aamFiredCount: 1,
      missiles: [{ weaponKey: 'w1', weaponClass: 'air_to_air_missile', inFlight: true, status: 'in_flight' }],
    });
    expect(sureShot.evaluate(killEvent(), state)).toBe(false);
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
      weaponClass: 'air_to_air_missile',
      occurredAt: new Date().toISOString(),
    });
    expect(state.sortieAamFiredCount).toBe(1);
  });

  it('does not increment for a non-AAM weapon', () => {
    const state = new PilotState();
    state.applyShotEnrichment({
      weaponKey: 'w1',
      weaponClass: 'bomb',
      occurredAt: new Date().toISOString(),
    });
    expect(state.sortieAamFiredCount).toBe(0);
  });

  it('does not double-count an update to an existing in-flight AAM', () => {
    const state = new PilotState();
    const shot = { weaponKey: 'w1', weaponClass: 'air_to_air_missile', occurredAt: new Date().toISOString() };
    state.applyShotEnrichment(shot);
    state.applyShotEnrichment(shot);
    expect(state.sortieAamFiredCount).toBe(1);
  });

  it('resets on takeoff enrichment', () => {
    const state = new PilotState();
    state.applyShotEnrichment({ weaponKey: 'w1', weaponClass: 'air_to_air_missile', occurredAt: new Date().toISOString() });
    expect(state.sortieAamFiredCount).toBe(1);
    state.applyTakeoffEnrichment({ launchedFromCarrier: false, occurredAt: new Date().toISOString() });
    expect(state.sortieAamFiredCount).toBe(0);
  });
});
