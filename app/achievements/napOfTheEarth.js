const Achievement = require('./achievement');

const NOE_DISTANCE_KM = 50;
const NOE_ALT_FT = 100;

class NapOfTheEarth extends Achievement {
  constructor() {
    super({
      id: 'nap_of_the_earth',
      name: 'Nap of the Earth',
      description: `Fly ${NOE_DISTANCE_KM} km consecutively at or below ${NOE_ALT_FT}ft AGL in a helicopter without climbing above ${NOE_ALT_FT}ft.`,
      triggerType: 'flight_sample_enrichment',
    });
  }

  evaluate(_event, state) {
    return state.currentUnitCategory === 'HELICOPTER' &&
           state.noeConsecutiveDistanceKm >= NOE_DISTANCE_KM;
  }
}

module.exports = new NapOfTheEarth();
