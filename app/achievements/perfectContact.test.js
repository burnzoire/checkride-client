const perfectContact = require('./perfectContact');
const PilotState = require('../services/pilotState');

const REFUEL_EVENT = { type: 'refuel_enrichment', playerUcid: 'pilot-1', playerName: 'Maverick', refuelStatus: 'completed', fuelGain: 0.3 };

function stateWith(longestRefuelContactSeconds) {
  const state = new PilotState();
  state.longestRefuelContactSeconds = longestRefuelContactSeconds;
  return state;
}

describe('PerfectContact — metadata', () => {
  it('has id perfect_contact', () => {
    expect(perfectContact.id).toBe('perfect_contact');
  });

  it('has triggerType refuel_enrichment', () => {
    expect(perfectContact.triggerType).toBe('refuel_enrichment');
  });
});

describe('PerfectContact — evaluate', () => {
  it('returns true at exactly 120 seconds', () => {
    expect(perfectContact.evaluate(REFUEL_EVENT, stateWith(120))).toBe(true);
  });

  it('returns true above 120 seconds', () => {
    expect(perfectContact.evaluate(REFUEL_EVENT, stateWith(180))).toBe(true);
  });

  it('returns false at 119 seconds', () => {
    expect(perfectContact.evaluate(REFUEL_EVENT, stateWith(119))).toBe(false);
  });

  it('returns false at 0 seconds', () => {
    expect(perfectContact.evaluate(REFUEL_EVENT, stateWith(0))).toBe(false);
  });
});

describe('PerfectContact — via applyRefuelEnrichment', () => {
  it('earns the achievement when durationSeconds reaches 120 via state', () => {
    const state = new PilotState();
    state.applyRefuelEnrichment({ refuelStatus: 'completed', fuelGain: 0.3, durationSeconds: 120 });
    expect(perfectContact.evaluate(REFUEL_EVENT, state)).toBe(true);
  });

  it('does not earn with durationSeconds below 120', () => {
    const state = new PilotState();
    state.applyRefuelEnrichment({ refuelStatus: 'completed', fuelGain: 0.3, durationSeconds: 119 });
    expect(perfectContact.evaluate(REFUEL_EVENT, state)).toBe(false);
  });

  it('tracks the longest contact across multiple refuels', () => {
    const state = new PilotState();
    state.applyRefuelEnrichment({ refuelStatus: 'completed', fuelGain: 0.1, durationSeconds: 90 });
    state.applyRefuelEnrichment({ refuelStatus: 'completed', fuelGain: 0.1, durationSeconds: 60 });
    state.applyRefuelEnrichment({ refuelStatus: 'completed', fuelGain: 0.1, durationSeconds: 125 });
    expect(perfectContact.evaluate(REFUEL_EVENT, state)).toBe(true);
  });
});
