const Achievement = require('./achievement');

/**
 * Fleet Defender — shoot down an enemy aircraft within 50nm of your carrier.
 *
 * Triggered by kill_enrichment events emitted by the mission script.
 * Requires the pilot to have launched from a carrier this sortie (launchedFromCarrier)
 * and to have a kill with victimUnitCategory 'air' and carrierDistanceNm <= 50.
 */
class FleetDefender extends Achievement {
  constructor() {
    super({
      id: 'fleet_defender',
      name: 'Fleet Defender',
      description: 'Shoot down an enemy aircraft within 50nm of your carrier.',
      triggerType: 'kill_enrichment',
      iconHint: 'Carrier-based fighter intercepting enemy aircraft over ocean',
      iconDescription: 'A carrier-based fighter launching missiles at an enemy aircraft silhouetted against the sky, with a carrier battle group visible below on the ocean.',
    });
  }

  evaluate(_event, state) {
    if (!state.launchedFromCarrier) return false;
    return state.enemyKills.some(
      k => k.victimUnitCategory === 'air' &&
           k.carrierDistanceNm !== null &&
           k.carrierDistanceNm <= 50
    );
  }
}

module.exports = new FleetDefender();
