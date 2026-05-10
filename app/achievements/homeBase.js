const Achievement = require('./achievement');

class HomeBase extends Achievement {
  constructor() {
    super({
      id: 'home_base',
      name: 'Home Base',
      description: 'Return to the airbase you took off from.',
      triggerType: 'landing_enrichment',
      iconHint: 'Aircraft touching down on friendly runway',
      iconDescription: 'A fighter jet touching down on a runway with a friendly flag visible at the airbase.',
    });
  }

  evaluate(event, state) {
    return event.airdromeName != null
      && state.takeoffLocation != null
      && event.airdromeName === state.takeoffLocation
      && state.sortieDistanceKm >= 1;
  }
}

module.exports = new HomeBase();
