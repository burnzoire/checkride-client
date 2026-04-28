const napOfTheEarth = require('./napOfTheEarth');
const PilotState = require('../services/pilotState');

function flightSample(overrides = {}) {
  return {
    type: 'flight_sample_enrichment',
    playerUcid: 'pilot-1',
    playerName: 'Viper',
    inAir: true,
    ...overrides,
  };
}

function applyNoeSamples(state, count, { positionStepM = 1000, altRadarFt = 30, missionTimeStep = 4 } = {}) {
  let missionTime = 0;
  let posX = 0;
  for (let i = 0; i < count; i++) {
    missionTime += missionTimeStep;
    posX += positionStepM;
    state.applyFlightSampleEnrichment(flightSample({
      altRadarFt,
      positionX: posX,
      positionY: 0,
      missionTime,
    }));
  }
}

describe('NapOfTheEarth — metadata', () => {
  it('has id nap_of_the_earth', () => {
    expect(napOfTheEarth.id).toBe('nap_of_the_earth');
  });

  it('has triggerType flight_sample_enrichment', () => {
    expect(napOfTheEarth.triggerType).toBe('flight_sample_enrichment');
  });
});

describe('NapOfTheEarth — evaluate', () => {
  it('returns false before enough NOE distance is accumulated', () => {
    const state = new PilotState();
    state.currentUnitCategory = 'HELICOPTER';
    applyNoeSamples(state, 5, { positionStepM: 500, altRadarFt: 30 }); // 2.5 km
    expect(napOfTheEarth.evaluate(flightSample(), state)).toBe(false);
  });

  it('returns true once 20 km of NOE distance is reached in a helicopter', () => {
    const state = new PilotState();
    state.currentUnitCategory = 'HELICOPTER';
    // 20 samples × 1000 m = 20 km, first sample has no prev position so 19 deltas
    applyNoeSamples(state, 21, { positionStepM: 1000, altRadarFt: 30 });
    expect(napOfTheEarth.evaluate(flightSample(), state)).toBe(true);
  });

  it('does not accumulate distance when radar alt is above 50ft', () => {
    const state = new PilotState();
    state.currentUnitCategory = 'HELICOPTER';
    applyNoeSamples(state, 30, { positionStepM: 1000, altRadarFt: 51 });
    expect(state.noeDistanceKm).toBe(0);
    expect(napOfTheEarth.evaluate(flightSample(), state)).toBe(false);
  });

  it('does not accumulate distance when not in air', () => {
    const state = new PilotState();
    state.currentUnitCategory = 'HELICOPTER';
    let posX = 0;
    for (let i = 0; i < 30; i++) {
      posX += 1000;
      state.applyFlightSampleEnrichment(flightSample({ altRadarFt: 20, positionX: posX, positionY: 0, inAir: false }));
    }
    expect(state.noeDistanceKm).toBe(0);
  });

  it('returns false when currentUnitCategory is not HELICOPTER', () => {
    const state = new PilotState();
    state.currentUnitCategory = 'AIRPLANE';
    applyNoeSamples(state, 25, { positionStepM: 1000, altRadarFt: 30 });
    expect(napOfTheEarth.evaluate(flightSample(), state)).toBe(false);
  });

  it('resets noeDistanceKm on sortie reset', () => {
    const state = new PilotState();
    state.currentUnitCategory = 'HELICOPTER';
    applyNoeSamples(state, 25, { positionStepM: 1000, altRadarFt: 30 });
    expect(state.noeDistanceKm).toBeGreaterThan(0);
    state.applyTakeoffEnrichment({ launchedFromCarrier: false, takeoffLocation: null });
    expect(state.noeDistanceKm).toBe(0);
  });
});

describe('NapOfTheEarth — distance accumulation', () => {
  it('accumulates correct distance across multiple samples', () => {
    const state = new PilotState();
    // 3 samples 1000m apart: first sample establishes position, 2 deltas × 1000m = 2 km
    state.applyFlightSampleEnrichment(flightSample({ altRadarFt: 30, positionX: 0, positionY: 0, inAir: true, missionTime: 1 }));
    state.applyFlightSampleEnrichment(flightSample({ altRadarFt: 30, positionX: 1000, positionY: 0, inAir: true, missionTime: 5 }));
    state.applyFlightSampleEnrichment(flightSample({ altRadarFt: 30, positionX: 2000, positionY: 0, inAir: true, missionTime: 9 }));
    expect(state.noeDistanceKm).toBeCloseTo(2, 5);
  });

  it('skips accumulation on the first sample when no previous position exists', () => {
    const state = new PilotState();
    state.applyFlightSampleEnrichment(flightSample({ altRadarFt: 30, positionX: 5000, positionY: 0, inAir: true, missionTime: 1 }));
    expect(state.noeDistanceKm).toBe(0);
  });

  it('ignores samples that would imply a jump > 5 km', () => {
    const state = new PilotState();
    state.applyFlightSampleEnrichment(flightSample({ altRadarFt: 30, positionX: 0, positionY: 0, inAir: true, missionTime: 1 }));
    state.applyFlightSampleEnrichment(flightSample({ altRadarFt: 30, positionX: 10000, positionY: 0, inAir: true, missionTime: 5 })); // 10 km jump — ignored
    expect(state.noeDistanceKm).toBe(0);
  });
});
