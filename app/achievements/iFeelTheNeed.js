const Achievement = require('./achievement');

const MIN_SUPERSONIC_MACH = 1.0;

class IFeelTheNeed extends Achievement {
  constructor() {
    super({
      id: 'i_feel_the_need',
      name: 'I feel the need...',
      description: 'Go supersonic in a sortie.',
      triggerType: 'flight_sample_enrichment',
      iconHint: 'Jet breaking sound barrier',
      iconDescription: 'A fighter jet piercing through a translucent vapor cone as it breaks the sound barrier, with dynamic shockwave rings trailing behind.',
    });
  }

  evaluate(_event, state) {
    return Number.isFinite(state.highestSpeedMach) && state.highestSpeedMach >= MIN_SUPERSONIC_MACH;
  }
}

module.exports = new IFeelTheNeed();