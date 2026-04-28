const fiveHundredMiles = require('./fiveHundredMiles');
const PilotState = require('../services/pilotState');

const DISTANCE_KM = 500 * 1.852;

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
  let posX = state.currentPositionX ?? 0;
  for (let i = 0; i < steps; i++) {
    const prev = posX;
    posX += stepKm * 1000;
    state.applyFlightSampleEnrichment(flightSample({ positionX: posX, positionY: 0 }));
  }
}

describe('FiveHundredMiles — metadata', () => {
  it('has id five_hundred_miles', () => {
    expect(fiveHundredMiles.id).toBe('five_hundred_miles');
  });

  it('has triggerType flight_sample_enrichment', () => {
    expect(fiveHundredMiles.triggerType).toBe('flight_sample_enrichment');
  });
});

describe('FiveHundredMiles — evaluate', () => {
  it('returns false before 500 nm flown', () => {
    const state = new PilotState();
    flyKm(state, 900);
    expect(fiveHundredMiles.evaluate(flightSample(), state)).toBe(false);
  });

  it('returns true once 500 nm (926 km) is reached', () => {
    const state = new PilotState();
    flyKm(state, DISTANCE_KM + 1);
    expect(fiveHundredMiles.evaluate(flightSample(), state)).toBe(true);
  });

  it('does not count ground movement (inAir: false)', () => {
    const state = new PilotState();
    let posX = 0;
    for (let i = 0; i < 1000; i++) {
      posX += 1000;
      state.applyFlightSampleEnrichment(flightSample({ positionX: posX, positionY: 0, inAir: false }));
    }
    expect(state.sortieDistanceKm).toBe(0);
    expect(fiveHundredMiles.evaluate(flightSample(), state)).toBe(false);
  });

  it('resets on sortie reset', () => {
    const state = new PilotState();
    flyKm(state, DISTANCE_KM + 1);
    expect(fiveHundredMiles.evaluate(flightSample(), state)).toBe(true);
    state.applyTakeoffEnrichment({ launchedFromCarrier: false, takeoffLocation: null });
    expect(state.sortieDistanceKm).toBe(0);
    expect(fiveHundredMiles.evaluate(flightSample(), state)).toBe(false);
  });
});
