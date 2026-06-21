const Achievement = require('./achievement');

class UnicornShot extends Achievement {
  constructor() {
    super({
      id: 'unicorn_shot',
      name: 'Unicorn Shot',
      description: 'Destroy an airborne target with unguided rockets.',
      triggerType: 'kill_enrichment',
      iconHint: 'Unguided rockets destroying airborne target',
      iconDescription: 'A salvo of unguided rockets streaking upward toward an airborne target silhouette.',
    });
  }

  evaluate(_event, state) {
    const kill = state.kills[state.kills.length - 1];
    if (!kill || kill.fratricide) return false;
    return kill.victimUnitCategory === 'air'
      && kill.weaponClass === 'ROCKET'
      && kill.weaponGuidance === 'NONE';
  }
}

module.exports = new UnicornShot();
