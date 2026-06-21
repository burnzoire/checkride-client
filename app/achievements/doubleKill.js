const Achievement = require('./achievement');

const ARMOUR_ROLES = new Set(['Armour', 'Tanks', 'IFV', 'APC']);
const SAME_EXPLOSION_WINDOW_S = 0.1;

function isArmourKill(kill) {
  return kill.victimUnitCategory === 'ground' &&
         Array.isArray(kill.victimRoles) &&
         kill.victimRoles.some(r => ARMOUR_ROLES.has(r)) &&
         kill.killedAtMs != null;
}

class DoubleKill extends Achievement {
  constructor() {
    super({
      id: 'double_kill',
      name: 'Double Kill',
      description: 'Destroy two armored vehicles with a single release.',
      triggerType: 'kill_enrichment',
    });
  }

  evaluate(_event, state) {
    const armourKills = state.enemyKills
      .filter(isArmourKill)
      .sort((a, b) => a.killedAtMs - b.killedAtMs);

    for (let i = 1; i < armourKills.length; i++) {
      if (armourKills[i].killedAtMs - armourKills[i - 1].killedAtMs <= SAME_EXPLOSION_WINDOW_S) {
        return true;
      }
    }
    return false;
  }
}

module.exports = new DoubleKill();
