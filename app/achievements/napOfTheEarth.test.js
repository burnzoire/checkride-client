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

function applyNoeSamples(state, count, { positionStepM = 1000, altRadarFt = 80, missionTimeStep = 4 } = {}) {
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
    applyNoeSamples(state, 5, { positionStepM: 500, altRadarFt: 80 }); // 2.5 km
    expect(napOfTheEarth.evaluate(flightSample(), state)).toBe(false);
  });

  it('returns true once 50 km of consecutive NOE distance is reached in a helicopter', () => {
    const state = new PilotState();
    state.currentUnitCategory = 'HELICOPTER';
    // 51 samples × 1000 m = 51 km, first sample has no prev position so 50 deltas
    applyNoeSamples(state, 51, { positionStepM: 1000, altRadarFt: 80 });
    expect(napOfTheEarth.evaluate(flightSample(), state)).toBe(true);
  });

  it('does not accumulate distance when radar alt is above 100ft', () => {
    const state = new PilotState();
    state.currentUnitCategory = 'HELICOPTER';
    applyNoeSamples(state, 60, { positionStepM: 1000, altRadarFt: 101 });
    expect(state.noeDistanceKm).toBe(0);
    expect(state.noeConsecutiveDistanceKm).toBe(0);
    expect(napOfTheEarth.evaluate(flightSample(), state)).toBe(false);
  });

  it('resets consecutive distance when radar alt exceeds 100ft, requiring restart', () => {
    const state = new PilotState();
    state.currentUnitCategory = 'HELICOPTER';
    // Fly 30 km NOE, then climb above 100ft, then fly another 25 km — never reaches 50 km consecutive
    applyNoeSamples(state, 31, { positionStepM: 1000, altRadarFt: 80 }); // ~30 km consecutive
    applyNoeSamples(state, 3,  { positionStepM: 1000, altRadarFt: 200 }); // above 100ft — resets consecutive
    applyNoeSamples(state, 26, { positionStepM: 1000, altRadarFt: 80 }); // ~25 km consecutive
    expect(state.noeConsecutiveDistanceKm).toBeLessThan(50);
    expect(napOfTheEarth.evaluate(flightSample(), state)).toBe(false);
  });

  it('awards achievement for 50 km consecutive after a broken run', () => {
    const state = new PilotState();
    state.currentUnitCategory = 'HELICOPTER';
    applyNoeSamples(state, 31, { positionStepM: 1000, altRadarFt: 80 }); // ~30 km — breaks
    applyNoeSamples(state, 3,  { positionStepM: 1000, altRadarFt: 200 }); // resets consecutive
    applyNoeSamples(state, 52, { positionStepM: 1000, altRadarFt: 80 }); // ~51 km consecutive
    expect(napOfTheEarth.evaluate(flightSample(), state)).toBe(true);
  });

  it('does not accumulate distance when not in air', () => {
    const state = new PilotState();
    state.currentUnitCategory = 'HELICOPTER';
    let posX = 0;
    for (let i = 0; i < 30; i++) {
      posX += 1000;
      state.applyFlightSampleEnrichment(flightSample({ altRadarFt: 80, positionX: posX, positionY: 0, inAir: false }));
    }
    expect(state.noeDistanceKm).toBe(0);
  });

  it('returns false when currentUnitCategory is not HELICOPTER', () => {
    const state = new PilotState();
    state.currentUnitCategory = 'AIRPLANE';
    applyNoeSamples(state, 25, { positionStepM: 1000, altRadarFt: 30 });
    expect(napOfTheEarth.evaluate(flightSample(), state)).toBe(false);
  });

  it('resets noeDistanceKm and noeConsecutiveDistanceKm on sortie reset', () => {
    const state = new PilotState();
    state.currentUnitCategory = 'HELICOPTER';
    applyNoeSamples(state, 25, { positionStepM: 1000, altRadarFt: 30 });
    expect(state.noeDistanceKm).toBeGreaterThan(0);
    expect(state.noeConsecutiveDistanceKm).toBeGreaterThan(0);
    state.applyTakeoffEnrichment({ launchedFromCarrier: false, takeoffLocation: null });
    expect(state.noeDistanceKm).toBe(0);
    expect(state.noeConsecutiveDistanceKm).toBe(0);
  });
});

describe('NapOfTheEarth — distance accumulation', () => {
  it('accumulates correct distance across multiple samples', () => {
    const state = new PilotState();
    // 3 samples 1000m apart: first sample establishes position, 2 deltas × 1000m = 2 km
    state.applyFlightSampleEnrichment(flightSample({ altRadarFt: 80, positionX: 0, positionY: 0, inAir: true, missionTime: 1 }));
    state.applyFlightSampleEnrichment(flightSample({ altRadarFt: 80, positionX: 1000, positionY: 0, inAir: true, missionTime: 5 }));
    state.applyFlightSampleEnrichment(flightSample({ altRadarFt: 80, positionX: 2000, positionY: 0, inAir: true, missionTime: 9 }));
    expect(state.noeDistanceKm).toBeCloseTo(2, 5);
  });

  it('skips accumulation on the first sample when no previous position exists', () => {
    const state = new PilotState();
    state.applyFlightSampleEnrichment(flightSample({ altRadarFt: 80, positionX: 5000, positionY: 0, inAir: true, missionTime: 1 }));
    expect(state.noeDistanceKm).toBe(0);
  });

  it('ignores samples that would imply a jump > 5 km', () => {
    const state = new PilotState();
    state.applyFlightSampleEnrichment(flightSample({ altRadarFt: 80, positionX: 0, positionY: 0, inAir: true, missionTime: 1 }));
    state.applyFlightSampleEnrichment(flightSample({ altRadarFt: 80, positionX: 10000, positionY: 0, inAir: true, missionTime: 5 })); // 10 km jump — ignored
    expect(state.noeDistanceKm).toBe(0);
  });
});
