const Achievement = require('./achievement');

const SLAPSHOT_WINDOW_S = 5;

class Slapshot extends Achievement {
  constructor() {
    super({
      id: 'slapshot',
      name: 'Slapshot',
      description: 'Fire an anti-radiation missile within 5 seconds of a SAM launch.',
      triggerType: 'shot_enrichment',
    });
  }

  evaluate(event, state) {
    // DCS misclassifies the AGM-88 HARM as RADAR_SEMI_ACTIVE (guidance type 5) rather than
    // RADAR_PASSIVE (type 6). Accept both for non-AAM weapons to cover this quirk while
    // excluding genuine SARH air-to-air missiles (AIM-7, R-27R, etc.).
    const isArm = event.weaponGuidance === 'RADAR_PASSIVE' ||
      (event.weaponGuidance === 'RADAR_SEMI_ACTIVE' && event.weaponClass !== 'air_to_air_missile');
    if (!isArm) return false;
    const armTimeS = event.missionTime ?? null;
    if (armTimeS == null) return false;
    return state.inboundMissiles.some(m => {
      if (m.initiatorRole !== 'SAM') return false;
      const launchedS = m.launchedAtMs / 1000;
      const delta = armTimeS - launchedS;
      return delta >= 0 && delta <= SLAPSHOT_WINDOW_S;
    });
  }
}

module.exports = new Slapshot();
