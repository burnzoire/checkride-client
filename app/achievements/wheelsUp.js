const Achievement = require('./achievement');

class WheelsUp extends Achievement {
  constructor() {
    super({
      id: 'wheels_up',
      name: 'Airborne',
      description: 'Complete your first ever takeoff.',
      triggerType: 'takeoff',
      iconHint: 'Aircraft lifting off',
      iconDescription: 'An aircraft lifting off, seen from the side.',
    });
  }

  evaluate(_event, _state) {
    return true;
  }
}

module.exports = new WheelsUp();
