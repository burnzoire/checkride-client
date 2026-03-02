const Achievement = require('./achievement');

/**
 * Bolter Bolter! — bolter twice in a row.
 * consecutiveBolters is incremented before evaluate is called,
 * so >= 2 means this is at least the second bolter in a row.
 */
class BolterBolter extends Achievement {
  constructor() {
    super({
      id: 'bolter_bolter',
      name: 'Bolter Bolter!',
      description: 'Bolter on two consecutive passes.',
      triggerType: 'grading',
      iconHint: 'Wave-off lights and a jet climbing away from the deck',
      iconDescription: 'Red wave-off lights blazing on the IFLOLS as a jet climbs away from the deck with afterburner lit, viewed from the LSO platform.',

    });
  }

  evaluate(_event, state) {
    return state.consecutiveBolters >= 2;
  }
}

module.exports = new BolterBolter();
