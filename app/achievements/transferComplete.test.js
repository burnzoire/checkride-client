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
  it('returns true on contact_end with >=10% fuel gain', () => {
    const state = { lastRefuelFuelGain: 0.10 };
    const result = transferComplete.evaluate({ contactEvent: 'contact_end' }, state);
    expect(result).toBe(true);
  });

  it('returns false when fuel gain is below threshold', () => {
    const state = { lastRefuelFuelGain: 0.09 };
    const result = transferComplete.evaluate({ contactEvent: 'contact_end' }, state);
    expect(result).toBe(false);
  });

  it('returns false on contact_start', () => {
    const state = { lastRefuelFuelGain: 0.20 };
    const result = transferComplete.evaluate({ contactEvent: 'contact_start' }, state);
    expect(result).toBe(false);
  });
});