const Achievement = require('./achievement');

class Defeated extends Achievement {
  constructor() {
    super({
      id: 'defeated',
      name: 'Defeated',
      description: 'Evade an incoming SAM.',
      triggerType: 'inbound_missile_miss',
    });
  }

  evaluate(event, _state) {
    return event.initiatorRole === 'SAM';
  }
}

module.exports = new Defeated();
