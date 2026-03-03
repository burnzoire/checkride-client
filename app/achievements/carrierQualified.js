const Achievement = require('./achievement');

/**
 * Carrier Qualified — accumulate 6 carrier traps in a single session.
 */
class CarrierQualified extends Achievement {
  constructor() {
    super({
      id: 'carrier_qualified',
      name: 'Carrier Qualified',
      description: 'Make 6 arrested landings on a carrier in a single session.',
      triggerType: 'grading',
      iconHint: 'Naval aviator wings over a carrier flight deck',
      iconDescription: 'Gold naval aviator wings badge with a carrier silhouette beneath them, viewed from the stern.',

    });
  }

  evaluate(_event, state) {
    return state.trapCount >= 6;
  }
}

module.exports = new CarrierQualified();
