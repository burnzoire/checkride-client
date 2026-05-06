const Achievement = require('./achievement');

class FoxFour extends Achievement {
  constructor() {
    super({
      id: 'fox_four',
      name: 'Fox Four',
      description: 'Destroy an enemy aircraft by ramming it.',
      triggerType: 'kill_enrichment',
      iconHint: 'Two aircraft colliding',
      iconDescription: 'Two fighter silhouettes colliding head-on in a dramatic fireball against a dark sky.',
    });
  }

  evaluate(_event, state) {
    const kill = state.kills[state.kills.length - 1];
    if (!kill) return false;
    return kill.victimUnitCategory === 'air'
      && kill.weaponClass === 'COLLISION';
  }
}

module.exports = new FoxFour();
