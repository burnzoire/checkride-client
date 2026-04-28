const Achievement = require('./achievement');

class SureShot extends Achievement {
  constructor() {
    super({
      id: 'sure_shot',
      name: 'Sure Shot',
      description: 'Score a kill with your first air-to-air missile fired.',
      triggerType: 'kill_enrichment',
    });
  }

  evaluate(event, state) {
    if (event.victimUnitCategory !== 'air') return false;
    if (state.sortieAamFiredCount !== 1) return false;
    return state.missiles.some(m => m.status === 'hit');
  }
}

module.exports = new SureShot();
