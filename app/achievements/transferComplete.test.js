const transferComplete = require('./transferComplete');

describe('TransferComplete - metadata', () => {
  it('has id transfer_complete', () => {
    expect(transferComplete.id).toBe('transfer_complete');
  });

  it('has triggerType refuel_enrichment', () => {
    expect(transferComplete.triggerType).toBe('refuel_enrichment');
  });
});

describe('TransferComplete - evaluate', () => {
  it('returns true with >=10% fuel gain', () => {
    const state = { lastRefuelFuelGain: 0.10 };
    const result = transferComplete.evaluate({ refuelStatus: 'completed', fuelGain: 0.10 }, state);
    expect(result).toBe(true);
  });

  it('returns false when fuel gain is below threshold', () => {
    const state = { lastRefuelFuelGain: 0.09 };
    const result = transferComplete.evaluate({ refuelStatus: 'completed', fuelGain: 0.09 }, state);
    expect(result).toBe(false);
  });

  it('returns false for started refuel events', () => {
    const state = { lastRefuelFuelGain: 0.20 };
    const result = transferComplete.evaluate({ refuelStatus: 'started', fuelGain: 0.20 }, state);
    expect(result).toBe(false);
  });

  it('returns false when event has no positive fuel gain', () => {
    const state = { lastRefuelFuelGain: 0.20 };
    const result = transferComplete.evaluate({ refuelStatus: 'completed', fuelGain: 0 }, state);
    expect(result).toBe(false);
  });
});