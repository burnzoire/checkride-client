const heyManNiceShot = require('./heyManNiceShot');
const PilotState = require('../services/pilotState');

const FIGHTER_OBJ_ID = 42;

function killEvent(overrides = {}) {
  return {
    type: 'kill_enrichment',
    playerUcid: 'pilot-1',
    playerName: 'Maverick',
    victimUnitCategory: 'air',
    victimObjectId: FIGHTER_OBJ_ID,
    ...overrides,
  };
}

function stateWithEvadedMissile({ initiatorObjectId = FIGHTER_OBJ_ID, status = 'evaded' } = {}) {
  const state = new PilotState();
  state.inboundMissiles.push({
    weaponKey: 'w1',
    inFlight: false,
    status,
    initiatorObjectId,
    launchedAtMs: 100000,
    completedAtMs: 105000,
  });
  return state;
}

describe('HeyManNiceShot — metadata', () => {
  it('has id hey_man_nice_shot', () => {
    expect(heyManNiceShot.id).toBe('hey_man_nice_shot');
  });

  it('has triggerType kill_enrichment', () => {
    expect(heyManNiceShot.triggerType).toBe('kill_enrichment');
  });
});

describe('HeyManNiceShot — evaluate', () => {
  it('returns true when an air kill matches a previously evaded missile from that unit', () => {
    const state = stateWithEvadedMissile();
    expect(heyManNiceShot.evaluate(killEvent(), state)).toBe(true);
  });

  it('returns false when the kill victim does not match the missile initiator', () => {
    const state = stateWithEvadedMissile({ initiatorObjectId: 99 });
    expect(heyManNiceShot.evaluate(killEvent({ victimObjectId: FIGHTER_OBJ_ID }), state)).toBe(false);
  });

  it('returns false when the missile was hit (not evaded)', () => {
    const state = stateWithEvadedMissile({ status: 'hit' });
    expect(heyManNiceShot.evaluate(killEvent(), state)).toBe(false);
  });

  it('returns false for a ground kill even with a matching evaded missile', () => {
    const state = stateWithEvadedMissile();
    expect(heyManNiceShot.evaluate(killEvent({ victimUnitCategory: 'ground' }), state)).toBe(false);
  });

  it('returns false when victimObjectId is missing', () => {
    const state = stateWithEvadedMissile();
    expect(heyManNiceShot.evaluate(killEvent({ victimObjectId: undefined }), state)).toBe(false);
  });

  it('returns false with no inbound missile history', () => {
    const state = new PilotState();
    expect(heyManNiceShot.evaluate(killEvent(), state)).toBe(false);
  });
});
