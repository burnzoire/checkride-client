const boomShakalaka = require('./boomShakalaka');

describe('BoomShakalaka — metadata', () => {
  it('has id first_boom_contact', () => {
    expect(boomShakalaka.id).toBe('first_boom_contact');
  });

  it('has triggerType refuel_enrichment', () => {
    expect(boomShakalaka.triggerType).toBe('refuel_enrichment');
  });
});

describe('BoomShakalaka — evaluate', () => {
  it('returns true on boom refuel start with positive fuel gain', () => {
    const result = boomShakalaka.evaluate({ type: 'refuel_enrichment', refuelStatus: 'started', fuelGain: 0.06, system: 'boom' }, {});
    expect(result).toBe(true);
  });

  it('returns false for completed boom refuel events', () => {
    const result = boomShakalaka.evaluate({ type: 'refuel_enrichment', refuelStatus: 'completed', fuelGain: 0.06, system: 'boom' }, {});
    expect(result).toBe(false);
  });

  it('returns false for boom event without positive fuel gain', () => {
    const result = boomShakalaka.evaluate({ type: 'refuel_enrichment', refuelStatus: 'started', fuelGain: 0, system: 'boom' }, {});
    expect(result).toBe(false);
  });

  it('returns false for basket refuel', () => {
    const result = boomShakalaka.evaluate({ type: 'refuel_enrichment', refuelStatus: 'started', fuelGain: 0.05, system: 'basket' }, {});
    expect(result).toBe(false);
  });
});
