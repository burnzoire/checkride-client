const defeated = require('./defeated');
const PilotState = require('../services/pilotState');

function missEvent(overrides = {}) {
  return {
    type: 'inbound_missile_miss',
    playerUcid: 'pilot-1',
    playerName: 'Maverick',
    weaponKey: 'inbound-1',
    initiatorRole: 'SAM',
    ...overrides,
  };
}

describe('Defeated — metadata', () => {
  it('has id defeated', () => {
    expect(defeated.id).toBe('defeated');
  });

  it('has triggerType inbound_missile_miss', () => {
    expect(defeated.triggerType).toBe('inbound_missile_miss');
  });
});

describe('Defeated — evaluate', () => {
  let state;
  beforeEach(() => { state = new PilotState(); });

  it('returns true when a SAM missile is evaded', () => {
    expect(defeated.evaluate(missEvent({ initiatorRole: 'SAM' }), state)).toBe(true);
  });

  it('returns false when an AAA missile is evaded', () => {
    expect(defeated.evaluate(missEvent({ initiatorRole: 'AAA' }), state)).toBe(false);
  });

  it('returns false when a fighter missile is evaded', () => {
    expect(defeated.evaluate(missEvent({ initiatorRole: 'FIGHTER' }), state)).toBe(false);
  });

  it('returns false when initiatorRole is missing', () => {
    expect(defeated.evaluate(missEvent({ initiatorRole: undefined }), state)).toBe(false);
  });
});
