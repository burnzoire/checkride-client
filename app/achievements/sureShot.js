const Achievement = require('./achievement');

class SureShot extends Achievement {
  constructor() {
    super({
      id: 'sure_shot',
      name: 'Sure Shot',
      description: 'Score a hit with your first air-to-air missile fired.',
      triggerType: 'hit_enrichment',
    });
  }

  evaluate(event, state) {
    if (event.weaponClass !== 'AAM') return false;
    if (state.sortieAamFiredCount !== 1) return false;
    return true;
  }
}

module.exports = new SureShot();
