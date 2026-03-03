const Achievement = require('./achievement');

/**
 * Night Qualified — accumulate 2 night carrier traps in a single session.
 */
class NightQualified extends Achievement {
  constructor() {
    super({
      id: 'night_qualified',
      name: 'Night Qualified',
      description: 'Make 2 arrested landings on a carrier at night in a single session.',
      triggerType: 'grading',
      iconHint: 'Carrier deck at night with approach lighting',
      iconDescription: 'Dark carrier deck seen from final approach, lit only by the IFLOLS meatball and deck edge lights against a black sky.',

    });
  }

  evaluate(_event, state) {
    return state.nightTrapCount >= 2;
  }
}

module.exports = new NightQualified();
