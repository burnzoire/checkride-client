const Achievement = require('./achievement');

const PASS_WINDOW_S = 30;
const MIN_SPEED_KTS = 400;
const MIN_KILLS = 5;

const WEAPON_CLASS_TO_AMMO_CATEGORY = {
  BOMB: 3,
  ROCKET: 2,
  MISSILE: 1,
};

function allWeaponsExpended(windowKills, payload) {
  if (!Array.isArray(payload)) return false;
  const usedCategories = new Set(
    windowKills.map(k => WEAPON_CLASS_TO_AMMO_CATEGORY[k.weaponClass]).filter(cat => cat != null)
  );
  if (usedCategories.size === 0) return false;
  return [...usedCategories].every(cat =>
    payload.every(item => item.category !== cat || item.count === 0)
  );
}

class OnePassHaulAss extends Achievement {
  constructor() {
    super({
      id: 'one_pass_haul_ass',
      name: 'One Pass, Haul Ass',
      description: 'Destroy 5 or more ground units in a single attack pass above 400 kts while expending all ordnance.',
      triggerType: 'kill_enrichment',
      iconHint: 'Fast jet egressing with empty hardpoints',
      iconDescription: 'A fighter jet in a steep climbing egress away from a burning target area, hardpoints empty, afterburner lit.',
    });
  }

  evaluate(_event, state) {
    const eligible = state.enemyKills
      .filter(k =>
        k.victimUnitCategory === 'ground'
        && k.killedAtMs != null
        && k.pilotSpeedKts != null
        && k.pilotSpeedKts > MIN_SPEED_KTS
      )
      .sort((a, b) => a.killedAtMs - b.killedAtMs);

    if (eligible.length < MIN_KILLS) return false;

    for (let i = 0; i <= eligible.length - MIN_KILLS; i++) {
      const windowStart = eligible[i].killedAtMs;
      const windowKills = eligible.filter(k => k.killedAtMs - windowStart <= PASS_WINDOW_S);
      if (windowKills.length < MIN_KILLS) continue;
      if (allWeaponsExpended(windowKills, state.currentPayload)) return true;
    }

    return false;
  }
}

module.exports = new OnePassHaulAss();
