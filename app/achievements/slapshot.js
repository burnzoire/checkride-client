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
    if (event.weaponClass !== 'ARM') return false;
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
