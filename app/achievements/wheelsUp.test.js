const wheelsUp = require('./wheelsUp');
const PilotState = require('../services/pilotState');

const state = new PilotState();

function takeoffEvent(overrides = {}) {
  return { type: 'takeoff', playerUcid: 'pilot-1', playerName: 'Maverick', ...overrides };
}

describe('WheelsUp — metadata', () => {
  it('has id wheels_up', () => {
    expect(wheelsUp.id).toBe('wheels_up');
  });

  it('has triggerType takeoff', () => {
    expect(wheelsUp.triggerType).toBe('takeoff');
  });
});

describe('WheelsUp — evaluate', () => {
  it('returns true for any takeoff', () => {
    expect(wheelsUp.evaluate(takeoffEvent(), state)).toBe(true);
  });

  it('returns true for a helicopter takeoff', () => {
    expect(wheelsUp.evaluate(takeoffEvent({ unitAttributes: ['Helicopters'] }), state)).toBe(true);
  });
});
