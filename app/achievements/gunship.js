const Achievement = require('./achievement');

const GROUND_KILLS_REQUIRED = 15;

class Gunship extends Achievement {
  constructor() {
    super({
      id: 'gunship',
      name: 'I AM THE GREATEST!',
      description: `Destroy ${GROUND_KILLS_REQUIRED} enemy ground units in a single sortie while flying a helicopter.`,
      triggerType: 'kill_enrichment',
    });
  }

  evaluate(_event, state) {
    const heloGroundKills = state.enemyKills.filter(
      k => k.killerUnitCategory === 'HELICOPTER' && k.victimUnitCategory === 'ground'
    ).length;
    return heloGroundKills >= GROUND_KILLS_REQUIRED;
  }
}

module.exports = new Gunship();
