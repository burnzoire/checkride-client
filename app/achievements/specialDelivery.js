const Achievement = require('./achievement');

const MIN_MISSILE_HIT_RANGE_NM = 45;

class SpecialDelivery extends Achievement {
  constructor() {
    super({
      id: 'special_delivery',
      name: 'Special Delivery',
      description: 'Land a missile hit beyond 45nm.',
      triggerType: 'hit_enrichment',
      iconHint: 'Long-range missile intercept',
      iconDescription: 'A long-range air-to-air missile streaking across the sky and striking a distant target, with a tactical radar-style range ring in the background.',
    });
  }

  evaluate(_event, state) {
    return Number.isFinite(state.longestMissileHit) && state.longestMissileHit > MIN_MISSILE_HIT_RANGE_NM;
  }
}

module.exports = new SpecialDelivery();