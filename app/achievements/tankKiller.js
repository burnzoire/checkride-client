const Achievement = require('./achievement');

const ARMOUR_ROLES = new Set(['Armour', 'Tanks', 'IFV', 'APC']);

class TankKiller extends Achievement {
  constructor() {
    super({
      id: 'tank_killer',
      name: 'Tank Killer',
      description: 'Destroy 10 armor in a single sortie.',
      triggerType: 'kill_enrichment',
    });
  }

  evaluate(_event, state) {
    const armourKills = state.kills.filter(
      k => k.victimUnitCategory === 'ground' &&
           Array.isArray(k.victimRoles) &&
           k.victimRoles.some(r => ARMOUR_ROLES.has(r))
    ).length;
    return armourKills >= 10;
  }
}

module.exports = new TankKiller();
