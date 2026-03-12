const Achievement = require('./achievement');

const MIN_FUEL_GAIN = 0.10;

class TransferComplete extends Achievement {
  constructor() {
    super({
      id: 'transfer_complete',
      name: 'Transfer Complete',
      description: 'Complete a refuel contact and gain at least 10% fuel.',
      triggerType: 'refuel_enrichment',
      iconHint: 'Successful aerial refuel transfer',
      iconDescription: 'Receiver aircraft disconnecting from tanker after a clean fuel transfer, with both aircraft stable in formation.',
    });
  }

  evaluate(event, state) {
    if (event.refuelStatus !== 'completed') return false;
    const fuelGain = event.fuelGain ?? event.fuel_gain;
    if (!(typeof fuelGain === 'number' && Number.isFinite(fuelGain) && fuelGain > 0)) return false;

    return Number.isFinite(state.lastRefuelFuelGain) && state.lastRefuelFuelGain >= MIN_FUEL_GAIN;
  }
}

module.exports = new TransferComplete();