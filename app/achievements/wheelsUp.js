const Achievement = require('./achievement');

class WheelsUp extends Achievement {
  constructor() {
    super({
      id: 'wheels_up',
      name: 'Wheels Up',
      description: 'Complete your first ever takeoff.',
      triggerType: 'takeoff',
      iconHint: 'Aircraft lifting off runway',
      iconDescription: 'A fighter jet rotating off a runway with gear retracting, seen from the side.',
    });
  }

  evaluate(event, _state) {
    if (!Array.isArray(event.unitAttributes)) return true;
    return event.unitAttributes.includes('Planes');
  }
}

module.exports = new WheelsUp();
