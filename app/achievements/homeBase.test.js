const homeBase = require('./homeBase');
const PilotState = require('../services/pilotState');

function stateWith({ km = 5, takeoffLocation = 'Batumi' } = {}) {
  const state = new PilotState();
  state.sortieDistanceKm = km;
  state.takeoffLocation = takeoffLocation;
  return state;
}

describe('HomeBase — metadata', () => {
  it('has id home_base', () => {
    expect(homeBase.id).toBe('home_base');
  });

  it('has triggerType landing_enrichment', () => {
    expect(homeBase.triggerType).toBe('landing_enrichment');
  });
});

describe('HomeBase — evaluate', () => {
  it('returns true when landed at the takeoff airbase with sufficient distance', () => {
    expect(homeBase.evaluate({ airdromeName: 'Batumi' }, stateWith())).toBe(true);
  });

  it('returns true for a FARP landing when FARP name matches takeoff location', () => {
    expect(homeBase.evaluate({ airdromeName: 'FARP Two Streams' }, stateWith({ takeoffLocation: 'FARP Two Streams' }))).toBe(true);
  });

  it('returns false when distance is under 1 km', () => {
    expect(homeBase.evaluate({ airdromeName: 'Batumi' }, stateWith({ km: 0.9 }))).toBe(false);
  });

  it('returns false when landed at a different airbase', () => {
    expect(homeBase.evaluate({ airdromeName: 'Kobuleti' }, stateWith())).toBe(false);
  });

  it('returns false when airdromeName is null (field landing)', () => {
    expect(homeBase.evaluate({ airdromeName: null }, stateWith())).toBe(false);
  });

  it('returns false when takeoffLocation is null', () => {
    expect(homeBase.evaluate({ airdromeName: 'Batumi' }, stateWith({ takeoffLocation: null }))).toBe(false);
  });
});
