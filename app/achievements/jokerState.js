const Achievement = require('./achievement');

/**
 * Joker State — trap with less than 10% fuel remaining.
 * fuelState is a normalized 0.0–1.0 value provided by DCS via initiator:getFuel().
 * Only fires when the grading event includes a fuel reading (requires the
 * mission scripting layer to be active).
 */
class JokerState extends Achievement {
  constructor() {
    super({
      id: 'joker_state',
      name: 'Joker State',
      description: 'Trap with less than 10% fuel remaining.',
      iconHint: 'Cockpit fuel gauge needle on empty as a carrier looms ahead',
      iconDescription: 'A cockpit fuel gauge with the needle just above empty, the carrier deck visible through the HUD glass in the background.',

    });
  }

  evaluate(event, _state) {
    const isTrap = event.lsoGrade !== 'BOLTER' && Number.isFinite(event.wire);
    return isTrap && typeof event.fuelState === 'number' && event.fuelState < 0.1;
  }
}

module.exports = new JokerState();
