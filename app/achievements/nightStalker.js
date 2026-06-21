const Achievement = require('./achievement');

class NightStalker extends Achievement {
  constructor() {
    super({
      id: 'night_stalker',
      name: 'Night Stalker',
      description: 'Shoot down an enemy aircraft at night.',
      triggerType: 'kill_enrichment',
      iconHint: 'Aircraft kill at night',
      iconDescription: 'A missile streak against a dark sky ending in an explosion, stars visible in the background.',
    });
  }

  evaluate(_event, state) {
    const kill = state.kills[state.kills.length - 1];
    if (!kill || kill.fratricide) return false;
    return kill.victimUnitCategory === 'air' && kill.night === true;
  }
}

module.exports = new NightStalker();
