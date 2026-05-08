const wheelsUp = require('./wheelsUp');
const PilotState = require('../services/pilotState');

const TAKEOFF_EVENT = { type: 'takeoff', playerUcid: 'pilot-1', playerName: 'Maverick' };

describe('WheelsUp — metadata', () => {
  it('has id wheels_up', () => {
    expect(wheelsUp.id).toBe('wheels_up');
  });

  it('has triggerType takeoff', () => {
    expect(wheelsUp.triggerType).toBe('takeoff');
  });
});

describe('WheelsUp — evaluate', () => {
  it('always returns true', () => {
    expect(wheelsUp.evaluate(TAKEOFF_EVENT, new PilotState())).toBe(true);
  });
});
