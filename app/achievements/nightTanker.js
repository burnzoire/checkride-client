const Achievement = require('./achievement');

const MIN_FUEL_GAIN = 0.10;

class NightTanker extends Achievement {
  constructor() {
    super({
      id: 'night_tanker',
      name: 'Night Tanker',
      description: 'Complete a night refuel contact and gain at least 10% fuel.',
      triggerType: 'refuel_enrichment',
      iconHint: 'Night aerial refueling',
      iconDescription: 'Two aircraft silhouetted in moonlit night sky during aerial refueling with subtle nav lights visible.',
    });
  }

  evaluate(event, state) {
    const contactEvent = event.contactEvent ?? event.contact_event ?? event.contact;
    if (contactEvent !== 'contact_end') return false;
    if (event.night !== true) return false;

    return Number.isFinite(state.lastRefuelFuelGain) && state.lastRefuelFuelGain >= MIN_FUEL_GAIN;
  }
}

module.exports = new NightTanker();
