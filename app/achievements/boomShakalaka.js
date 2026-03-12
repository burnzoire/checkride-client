const Achievement = require('./achievement');

class BoomShakalaka extends Achievement {
  constructor() {
    super({
      id: 'first_boom_contact',
      name: 'Boom Shakalaka',
      description: 'Make your first successful contact with a tanker boom.',
      triggerType: 'refuel_enrichment',
      iconHint: 'Flying boom contact',
      iconDescription: 'A tanker boom operator perspective showing boom nozzle contacting the receiver aircraft refueling receptacle.',
    });
  }

  evaluate(event) {
    if (event.refuelStatus !== 'started') return false;
    const fuelGain = event.fuelGain ?? event.fuel_gain;
    if (!(typeof fuelGain === 'number' && Number.isFinite(fuelGain) && fuelGain > 0)) return false;

    const system = String(event.system || '').toLowerCase();
    return system === 'boom';
  }
}

module.exports = new BoomShakalaka();
