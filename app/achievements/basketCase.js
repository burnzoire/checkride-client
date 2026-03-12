const Achievement = require('./achievement');

class BasketCase extends Achievement {
  constructor() {
    super({
      id: 'first_basket_contact',
      name: 'Basket Case',
      description: 'Make your first successful contact with a tanker basket.',
      triggerType: 'refuel_enrichment',
      iconHint: 'Probe and drogue basket contact',
      iconDescription: 'A naval fighter probe contacting a tanker drogue basket with fuel hose tension visible against sky.',
    });
  }

  evaluate(event) {
    if (event.refuelStatus !== 'started') return false;
    const fuelGain = event.fuelGain ?? event.fuel_gain;
    if (!(typeof fuelGain === 'number' && Number.isFinite(fuelGain) && fuelGain > 0)) return false;

    const system = String(event.system || '').toLowerCase();
    return system === 'basket';
  }
}

module.exports = new BasketCase();
