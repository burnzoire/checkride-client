const thereAndBackAgain = require('./thereAndBackAgain');
const PilotState = require('../services/pilotState');

const MIN_DISTANCE_KM = 200 * 1.852;

function landingEvent(overrides = {}) {
  return {
    type: 'landing_enrichment',
    playerUcid: 'pilot-1',
    airdromeName: 'Batumi',
    ...overrides,
  };
}

function flightSample(overrides = {}) {
  return {
    type: 'flight_sample_enrichment',
    playerUcid: 'pilot-1',
    inAir: true,
    ...overrides,
  };
}

function flyKm(state, distanceKm) {
  const stepKm = 1;
  const steps = Math.ceil(distanceKm / stepKm);
  let posX = 0;
  for (let i = 0; i < steps; i++) {
    posX += stepKm * 1000;
    state.applyFlightSampleEnrichment(flightSample({ positionX: posX, positionY: 0 }));
  }
}

describe('ThereAndBackAgain — metadata', () => {
  it('has id there_and_back_again', () => {
    expect(thereAndBackAgain.id).toBe('there_and_back_again');
  });

  it('has triggerType landing_enrichment', () => {
    expect(thereAndBackAgain.triggerType).toBe('landing_enrichment');
  });
});

describe('ThereAndBackAgain — evaluate', () => {
  it('returns true when landed at departure airbase with 200+ nm flown', () => {
    const state = new PilotState();
    state.applyTakeoffEnrichment({ launchedFromCarrier: false, takeoffLocation: 'Batumi' });
    flyKm(state, MIN_DISTANCE_KM + 1);
    expect(thereAndBackAgain.evaluate(landingEvent({ airdromeName: 'Batumi' }), state)).toBe(true);
  });

  it('returns false when landing at a different airbase', () => {
    const state = new PilotState();
    state.applyTakeoffEnrichment({ launchedFromCarrier: false, takeoffLocation: 'Batumi' });
    flyKm(state, MIN_DISTANCE_KM + 1);
    expect(thereAndBackAgain.evaluate(landingEvent({ airdromeName: 'Kobuleti' }), state)).toBe(false);
  });

  it('returns false when distance is below 200 nm', () => {
    const state = new PilotState();
    state.applyTakeoffEnrichment({ launchedFromCarrier: false, takeoffLocation: 'Batumi' });
    flyKm(state, MIN_DISTANCE_KM - 10);
    expect(thereAndBackAgain.evaluate(landingEvent({ airdromeName: 'Batumi' }), state)).toBe(false);
  });

  it('returns false when no takeoff location is recorded', () => {
    const state = new PilotState();
    flyKm(state, MIN_DISTANCE_KM + 1);
    expect(thereAndBackAgain.evaluate(landingEvent({ airdromeName: 'Batumi' }), state)).toBe(false);
  });

  it('returns false when airdromeName is missing from event', () => {
    const state = new PilotState();
    state.applyTakeoffEnrichment({ launchedFromCarrier: false, takeoffLocation: 'Batumi' });
    flyKm(state, MIN_DISTANCE_KM + 1);
    expect(thereAndBackAgain.evaluate(landingEvent({ airdromeName: null }), state)).toBe(false);
  });
});
