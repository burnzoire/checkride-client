const Achievement = require('./achievement');

class MixedBag extends Achievement {
  constructor() {
    super({
      id: 'mixed_bag',
      name: 'Mixed Bag',
      description: 'Score a Fox 1, Fox 2, and Fox 3 air-to-air kill in a single sortie.',
      triggerType: 'kill_enrichment',
      iconHint: 'Three different missile types',
      iconDescription: 'Three missiles of distinct types — SARH, heat-seeking, and active radar — arranged side by side on a dark background.',
    });
  }

  evaluate(_event, state) {
    const airKills = state.kills.filter(k => k.victimUnitCategory === 'air');
    const hasFox1 = airKills.some(k => k.weaponGuidance === 'RADAR_SEMI_ACTIVE');
    const hasFox2 = airKills.some(k => k.weaponGuidance === 'IR');
    const hasFox3 = airKills.some(k => k.weaponGuidance === 'RADAR_ACTIVE');
    return hasFox1 && hasFox2 && hasFox3;
  }
}

module.exports = new MixedBag();
