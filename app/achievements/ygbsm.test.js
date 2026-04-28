const ygbsm = require('./ygbsm');
const PilotState = require('../services/pilotState');

function inboundEvent(weaponKey = 'w1') {
  return {
    type: 'inbound_missile',
    playerUcid: 'pilot-1',
    playerName: 'Maverick',
    weaponKey,
    initiatorRole: 'SAM',
    missionTime: 100,
  };
}

function stateWithInbound(count, inFlight = true) {
  const state = new PilotState();
  for (let i = 0; i < count; i++) {
    state.inboundMissiles.push({
      weaponKey: `w${i}`,
      inFlight,
      status: inFlight ? 'in_flight' : 'evaded',
      launchedAtMs: 100000,
      completedAtMs: inFlight ? null : 110000,
    });
  }
  return state;
}

describe('YGBSM — metadata', () => {
  it('has id ygbsm', () => {
    expect(ygbsm.id).toBe('ygbsm');
  });

  it('has triggerType inbound_missile', () => {
    expect(ygbsm.triggerType).toBe('inbound_missile');
  });
});

describe('YGBSM — evaluate', () => {
  it('returns true with exactly 5 in-flight inbound missiles', () => {
    const state = stateWithInbound(5);
    expect(ygbsm.evaluate(inboundEvent(), state)).toBe(true);
  });

  it('returns true with more than 5 in-flight missiles', () => {
    const state = stateWithInbound(7);
    expect(ygbsm.evaluate(inboundEvent(), state)).toBe(true);
  });

  it('returns false with only 4 in-flight missiles', () => {
    const state = stateWithInbound(4);
    expect(ygbsm.evaluate(inboundEvent(), state)).toBe(false);
  });

  it('does not count evaded missiles toward the threshold', () => {
    const state = new PilotState();
    for (let i = 0; i < 4; i++) {
      state.inboundMissiles.push({ weaponKey: `w${i}`, inFlight: true, status: 'in_flight', launchedAtMs: 100000, completedAtMs: null });
    }
    for (let i = 4; i < 8; i++) {
      state.inboundMissiles.push({ weaponKey: `w${i}`, inFlight: false, status: 'evaded', launchedAtMs: 100000, completedAtMs: 110000 });
    }
    expect(ygbsm.evaluate(inboundEvent(), state)).toBe(false);
  });
});
