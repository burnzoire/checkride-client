const Achievement = require('./achievement');

class DeathFromBelow extends Achievement {
  constructor() {
    super({
      id: 'death_from_below',
      name: 'Death from Below',
      description: 'Shoot down an enemy fixed-wing aircraft while flying a helicopter.',
      triggerType: 'kill_enrichment',
    });
  }

  evaluate(_event, state) {
    return state.kills.some(
      k => k.killerUnitCategory === 'HELICOPTER' && k.victimAirType === 'AIRPLANE'
    );
  }
}

module.exports = new DeathFromBelow();
