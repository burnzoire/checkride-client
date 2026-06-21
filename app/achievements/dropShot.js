const Achievement = require('./achievement');

class DropShot extends Achievement {
  constructor() {
    super({
      id: 'drop_shot',
      name: 'Drop Shot',
      description: 'Destroy an airborne helicopter with a bomb.',
      triggerType: 'kill_enrichment',
      iconHint: 'Bomb falling on helicopter',
      iconDescription: 'A falling iron bomb silhouetted against the sky above a burning helicopter rotor disk.',
    });
  }

  evaluate(_event, state) {
    const kill = state.kills[state.kills.length - 1];
    if (!kill || kill.fratricide) return false;
    return kill.victimUnitCategory === 'air'
      && kill.victimAirType === 'HELICOPTER'
      && kill.weaponClass === 'BOMB';
  }
}

module.exports = new DropShot();
