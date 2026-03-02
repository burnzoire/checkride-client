const Achievement = require('./achievement');

/**
 * Three Wire — catch the 3-wire on a carrier landing.
 * The 3-wire is considered the ideal wire by naval aviation tradition.
 */
class ThreeWire extends Achievement {
  constructor() {
    super({
      id: 'three_wire',
      name: 'Three Wire',
      description: 'Catch the 3-wire on a carrier landing.',
      triggerType: 'grading',
      iconHint: 'Arrested landing hook catching the 3-wire',
      iconDescription: 'Close-up of a tailhook snagging the third arresting wire on a carrier deck, the wire bowing under tension.',

    });
  }

  evaluate(event, _state) {
    return event.wire === 3;
  }
}

module.exports = new ThreeWire();
