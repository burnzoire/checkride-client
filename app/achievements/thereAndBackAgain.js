const Achievement = require('./achievement');

const MIN_DISTANCE_NM = 200;
const MIN_DISTANCE_KM = MIN_DISTANCE_NM * 1.852;

class ThereAndBackAgain extends Achievement {
  constructor() {
    super({
      id: 'there_and_back_again',
      name: 'There and Back Again',
      description: 'Travel 200 nm and return to your departure airbase.',
      triggerType: 'landing_enrichment',
      iconHint: 'Aircraft completing a full round trip',
      iconDescription: 'A top-down map view showing a circular flight path returning to the same airbase, with a distance marker.',
    });
  }

  evaluate(event, state) {
    if (!event.airdromeName || !state.takeoffLocation) return false;
    if (event.airdromeName !== state.takeoffLocation) return false;
    return state.sortieDistanceKm >= MIN_DISTANCE_KM;
  }
}

module.exports = new ThereAndBackAgain();
