const Achievement = require('./achievement');

class Shack extends Achievement {
  constructor() {
    super({
      id: 'shack',
      name: 'Shack!',
      description: 'Score your first ever ground kill.',
      triggerType: 'kill_enrichment',
      iconHint: 'Direct hit on ground target',
      iconDescription: 'A bomb impact on a ground target with a perfect explosion plume rising from the center.',
    });
  }

  evaluate(_event, state) {
    return state.enemyKills.some(k => k.victimUnitCategory === 'ground');
  }
}

module.exports = new Shack();
