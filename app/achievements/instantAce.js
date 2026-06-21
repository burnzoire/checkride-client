const Achievement = require('./achievement');

const ACE_KILLS = 5;

class InstantAce extends Achievement {
  constructor() {
    super({
      id: 'instant_ace',
      name: 'Instant Ace',
      description: 'Shoot down 5 enemy aircraft in a single sortie.',
      triggerType: 'kill_enrichment',
      iconHint: 'Five kill marks on fuselage',
      iconDescription: 'A fighter fuselage with five red star kill markings painted in a row.',
    });
  }

  evaluate(_event, state) {
    return state.enemyKills.filter(k => k.victimUnitCategory === 'air').length >= ACE_KILLS;
  }
}

module.exports = new InstantAce();
