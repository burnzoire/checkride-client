const Achievement = require('./achievement');

class Wanted extends Achievement {
  constructor() {
    super({
      id: 'wanted',
      name: 'Wanted',
      description: 'Become targeted by at least 5 missiles at the same time.',
      triggerType: 'inbound_missile',
    });
  }

  evaluate(_event, state) {
    return state.inboundMissiles.filter(m => m.inFlight).length >= 5;
  }
}

module.exports = new Wanted();
