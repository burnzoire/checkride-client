const basketCase = require('./basketCase');

describe('BasketCase — metadata', () => {
  it('has id first_basket_contact', () => {
    expect(basketCase.id).toBe('first_basket_contact');
  });

  it('has triggerType refuel_enrichment', () => {
    expect(basketCase.triggerType).toBe('refuel_enrichment');
  });
});

describe('BasketCase — evaluate', () => {
  it('returns true on basket refuel start with positive fuel gain', () => {
    const result = basketCase.evaluate({ type: 'refuel_enrichment', refuelStatus: 'started', fuelGain: 0.04, system: 'basket' }, {});
    expect(result).toBe(true);
  });

  it('returns false for completed basket refuel events', () => {
    const result = basketCase.evaluate({ type: 'refuel_enrichment', refuelStatus: 'completed', fuelGain: 0.04, system: 'basket' }, {});
    expect(result).toBe(false);
  });

  it('returns false for basket event without positive fuel gain', () => {
    const result = basketCase.evaluate({ type: 'refuel_enrichment', refuelStatus: 'started', fuelGain: 0, system: 'basket' }, {});
    expect(result).toBe(false);
  });

  it('returns false for boom refuel', () => {
    const result = basketCase.evaluate({ type: 'refuel_enrichment', refuelStatus: 'started', fuelGain: 0.03, system: 'boom' }, {});
    expect(result).toBe(false);
  });
});
