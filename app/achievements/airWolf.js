const Achievement = require('./achievement');

const MIN_SPEED_KTS = 50;
const MIN_KILLS = 3;

class AirWolf extends Achievement {
  constructor() {
    super({
      id: 'air_wolf',
      name: 'Air Wolf',
      description: 'Score 3 ground kills above 50 kts in a helicopter.',
      triggerType: 'kill_enrichment',
      iconHint: 'Attack helicopter at speed',
      iconDescription: 'An attack helicopter in a fast low-level attack run with gun firing, dust kicked up below.',
    });
  }

  evaluate(_event, state) {
    const kills = state.enemyKills.filter(k =>
      k.victimUnitCategory === 'ground'
      && k.killerUnitCategory === 'HELICOPTER'
      && k.pilotSpeedKts != null
      && k.pilotSpeedKts > MIN_SPEED_KTS
    );
    return kills.length >= MIN_KILLS;
  }
}

module.exports = new AirWolf();
