const Achievement = require('./achievement');

class Avenger extends Achievement {
  constructor() {
    super({
      id: 'avenger',
      name: 'Avenger',
      description: 'Destroy an enemy that recently took out a friendly aircraft.',
      triggerType: 'kill_enrichment',
    });
  }

  evaluate(_event, state) {
    return state.kills.some(k => k.avengedFriendly === true);
  }
}

module.exports = new Avenger();
