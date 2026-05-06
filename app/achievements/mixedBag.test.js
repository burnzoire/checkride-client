const mixedBag = require('./mixedBag');
const PilotState = require('../services/pilotState');

const KILL_EVENT = { type: 'kill_enrichment', playerUcid: 'pilot-1', playerName: 'Maverick' };

function stateWith(kills) {
  const state = new PilotState();
  state.kills = kills;
  return state;
}

const fox1Kill = { victimUnitCategory: 'air', weaponGuidance: 'RADAR_SEMI_ACTIVE' };
const fox2Kill = { victimUnitCategory: 'air', weaponGuidance: 'IR' };
const fox3Kill = { victimUnitCategory: 'air', weaponGuidance: 'RADAR_ACTIVE' };

describe('MixedBag — metadata', () => {
  it('has id mixed_bag', () => {
    expect(mixedBag.id).toBe('mixed_bag');
  });

  it('has triggerType kill_enrichment', () => {
    expect(mixedBag.triggerType).toBe('kill_enrichment');
  });
});

describe('MixedBag — evaluate', () => {
  it('returns true with one of each fox type', () => {
    expect(mixedBag.evaluate(KILL_EVENT, stateWith([fox1Kill, fox2Kill, fox3Kill]))).toBe(true);
  });

  it('returns true with multiple kills of each type', () => {
    expect(mixedBag.evaluate(KILL_EVENT, stateWith([
      fox1Kill, fox1Kill, fox2Kill, fox3Kill, fox3Kill,
    ]))).toBe(true);
  });

  it('returns false with only Fox 1 and Fox 2', () => {
    expect(mixedBag.evaluate(KILL_EVENT, stateWith([fox1Kill, fox2Kill]))).toBe(false);
  });

  it('returns false with only Fox 1 and Fox 3', () => {
    expect(mixedBag.evaluate(KILL_EVENT, stateWith([fox1Kill, fox3Kill]))).toBe(false);
  });

  it('returns false with only Fox 2 and Fox 3', () => {
    expect(mixedBag.evaluate(KILL_EVENT, stateWith([fox2Kill, fox3Kill]))).toBe(false);
  });

  it('returns false with only Fox 1', () => {
    expect(mixedBag.evaluate(KILL_EVENT, stateWith([fox1Kill]))).toBe(false);
  });

  it('returns false with no kills', () => {
    expect(mixedBag.evaluate(KILL_EVENT, stateWith([]))).toBe(false);
  });

  it('does not count ground kills toward the fox types', () => {
    expect(mixedBag.evaluate(KILL_EVENT, stateWith([
      fox1Kill,
      fox2Kill,
      { victimUnitCategory: 'ground', weaponGuidance: 'RADAR_ACTIVE' },
    ]))).toBe(false);
  });
});
