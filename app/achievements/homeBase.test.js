const homeBase = require('./homeBase');
const PilotState = require('../services/pilotState');

const state = new PilotState();

describe('HomeBase — metadata', () => {
  it('has id home_base', () => {
    expect(homeBase.id).toBe('home_base');
  });

  it('has triggerType landing_enrichment', () => {
    expect(homeBase.triggerType).toBe('landing_enrichment');
  });
});

describe('HomeBase — evaluate', () => {
  it('returns true when landed at a friendly airbase', () => {
    expect(homeBase.evaluate({ landedAtFriendlyBase: true }, state)).toBe(true);
  });

  it('returns false when landed at an enemy airbase', () => {
    expect(homeBase.evaluate({ landedAtFriendlyBase: false }, state)).toBe(false);
  });

  it('returns false when landedAtFriendlyBase is null', () => {
    expect(homeBase.evaluate({ landedAtFriendlyBase: null }, state)).toBe(false);
  });

  it('returns false for a field landing (no airbase)', () => {
    expect(homeBase.evaluate({ landedAtFriendlyBase: false, landedAtAirbase: false }, state)).toBe(false);
  });
});
