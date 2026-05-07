const Achievement = require('./achievement');

class SplashOne extends Achievement {
  constructor() {
    super({
      id: 'splash_one',
      name: 'Splash One',
      description: 'Score your first ever air-to-air kill.',
      triggerType: 'kill_enrichment',
      iconHint: 'Aircraft exploding in the air',
      iconDescription: 'A fireball in the sky with debris trailing, viewed from a cockpit perspective.',
    });
  }

  evaluate(_event, state) {
    return state.kills.some(k => k.victimUnitCategory === 'air');
  }
}

module.exports = new SplashOne();
