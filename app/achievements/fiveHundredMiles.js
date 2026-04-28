const Achievement = require('./achievement');

const DISTANCE_KM = 500 * 1.852;

class FiveHundredMiles extends Achievement {
  constructor() {
    super({
      id: 'five_hundred_miles',
      name: '500 Miles',
      description: 'Fly 500 nm in a single sortie.',
      triggerType: 'flight_sample_enrichment',
    });
  }

  evaluate(_event, state) {
    return state.sortieDistanceKm >= DISTANCE_KM;
  }
}

module.exports = new FiveHundredMiles();
