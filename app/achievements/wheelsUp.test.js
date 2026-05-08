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
  it('returns true for a fixed-wing takeoff', () => {
    expect(wheelsUp.evaluate(takeoffEvent({ unitAttributes: ['Planes', 'Fighters'] }), state)).toBe(true);
  });

  it('returns true when unitAttributes is absent', () => {
    expect(wheelsUp.evaluate(takeoffEvent(), state)).toBe(true);
  });

  it('returns true when unitAttributes is empty', () => {
    expect(wheelsUp.evaluate(takeoffEvent({ unitAttributes: [] }), state)).toBe(true);
  });

  it('returns false for a helicopter takeoff', () => {
    expect(wheelsUp.evaluate(takeoffEvent({ unitAttributes: ['Helicopters', 'Attack helicopters'] }), state)).toBe(false);
  });
});
