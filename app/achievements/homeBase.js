const Achievement = require('./achievement');

class HomeBase extends Achievement {
  constructor() {
    super({
      id: 'home_base',
      name: 'Home Base',
      description: 'Complete your first ever landing at a friendly airbase.',
      triggerType: 'landing_enrichment',
      iconHint: 'Aircraft touching down on friendly runway',
      iconDescription: 'A fighter jet touching down on a runway with a friendly flag visible at the airbase.',
    });
  }

  evaluate(event, state) {
    return event.landedAtFriendlyBase === true && state.sortieDistanceKm >= 1;
  }
}

module.exports = new HomeBase();
