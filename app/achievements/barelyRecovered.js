const Achievement = require('./achievement');

/**
 * Barely Recovered — trap with less than 5% fuel remaining.
 * fuelState is a normalized 0.0–1.0 value provided by DCS via initiator:getFuel().
 * Only fires when the grading event includes a fuel reading (requires the
 * mission scripting layer to be active).
 */
class BarelyRecovered extends Achievement {
  constructor() {
    super({
      id: 'barely_recovered',
      name: 'Barely Recovered',
      description: 'Trap with less than 5% fuel remaining.',
      triggerType: 'grading',
      iconHint: 'Cockpit fuel gauge needle on empty as a carrier looms ahead',
      iconDescription: 'A cockpit fuel gauge with the needle just above empty, the carrier deck visible through the HUD glass in the background.',

    });
  }

  evaluate(event, _state) {
    const isTrap = event.lsoGrade !== 'BOLTER' && Number.isFinite(event.wire);
    return isTrap && typeof event.fuelState === 'number' && event.fuelState < 0.05;
  }
}

module.exports = new BarelyRecovered();