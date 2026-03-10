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
  it('returns true on boom contact_start', () => {
    const result = boomShakalaka.evaluate({ type: 'refuel_enrichment', contactEvent: 'contact_start', system: 'boom' }, {});
    expect(result).toBe(true);
  });

  it('returns false on boom contact_end', () => {
    const result = boomShakalaka.evaluate({ type: 'refuel_enrichment', contactEvent: 'contact_end', system: 'boom' }, {});
    expect(result).toBe(false);
  });

  it('returns false for basket contact_start', () => {
    const result = boomShakalaka.evaluate({ type: 'refuel_enrichment', contactEvent: 'contact_start', system: 'basket' }, {});
    expect(result).toBe(false);
  });
});
