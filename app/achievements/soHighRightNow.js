const Achievement = require('./achievement');

const MIN_ALTITUDE_FT = 50000;

class SoHighRightNow extends Achievement {
  constructor() {
    super({
      id: 'so_high_right_now',
      name: 'So high right now',
      description: 'Reach 50,000 feet in a sortie.',
      triggerType: 'flight_sample_enrichment',
      iconHint: 'High-altitude climb',
      iconDescription: 'A fighter jet climbing above bright cloud tops into thin blue sky, with a prominent 50,000 ft altitude marker on a minimalist HUD overlay.',
    });
  }

  evaluate(_event, state) {
    return Number.isFinite(state.highestAltitudeFt) && state.highestAltitudeFt >= MIN_ALTITUDE_FT;
  }
}

module.exports = new SoHighRightNow();