const Achievement = require('./achievement');

const NOE_DISTANCE_KM = 20;

class NapOfTheEarth extends Achievement {
  constructor() {
    super({
      id: 'nap_of_the_earth',
      name: 'Nap of the Earth',
      description: `Fly ${NOE_DISTANCE_KM} km at or below 50ft AGL in a helicopter.`,
      triggerType: 'flight_sample_enrichment',
    });
  }

  evaluate(_event, state) {
    return state.currentUnitCategory === 'HELICOPTER' &&
           state.noeDistanceKm >= NOE_DISTANCE_KM;
  }
}

module.exports = new NapOfTheEarth();
