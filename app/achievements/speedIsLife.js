const Achievement = require('./achievement');

const MIN_MACH = 2.0;

class SpeedIsLife extends Achievement {
  constructor() {
    super({
      id: 'speed_is_life',
      name: 'Speed is life',
      description: 'Reach Mach 2.0 in a sortie.',
      triggerType: 'flight_sample_enrichment',
      iconHint: 'Extreme high-speed dash',
      iconDescription: 'A high-performance fighter in full afterburner accelerating through thin upper atmosphere with a bold Mach 2.0 HUD cue and contrail streaks.',
    });
  }

  evaluate(_event, state) {
    return Number.isFinite(state.highestSpeedMach) && state.highestSpeedMach >= MIN_MACH;
  }
}

module.exports = new SpeedIsLife();