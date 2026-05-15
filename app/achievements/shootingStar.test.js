const shootingStar = require('./shootingStar');
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

describe('ShootingStar — metadata', () => {
  it('has id shooting_star', () => {
    expect(shootingStar.id).toBe('shooting_star');
  });

  it('has triggerType kill_enrichment', () => {
    expect(shootingStar.triggerType).toBe('kill_enrichment');
  });
});

describe('ShootingStar — evaluate', () => {
  it('returns true with one of each fox type', () => {
    expect(shootingStar.evaluate(KILL_EVENT, stateWith([fox1Kill, fox2Kill, fox3Kill]))).toBe(true);
  });

  it('returns true with multiple kills of each type', () => {
    expect(shootingStar.evaluate(KILL_EVENT, stateWith([
      fox1Kill, fox1Kill, fox2Kill, fox3Kill, fox3Kill,
    ]))).toBe(true);
  });

  it('returns false with only Fox 1 and Fox 2', () => {
    expect(shootingStar.evaluate(KILL_EVENT, stateWith([fox1Kill, fox2Kill]))).toBe(false);
  });

  it('returns false with only Fox 1 and Fox 3', () => {
    expect(shootingStar.evaluate(KILL_EVENT, stateWith([fox1Kill, fox3Kill]))).toBe(false);
  });

  it('returns false with only Fox 2 and Fox 3', () => {
    expect(shootingStar.evaluate(KILL_EVENT, stateWith([fox2Kill, fox3Kill]))).toBe(false);
  });

  it('returns false with only Fox 1', () => {
    expect(shootingStar.evaluate(KILL_EVENT, stateWith([fox1Kill]))).toBe(false);
  });

  it('returns false with no kills', () => {
    expect(shootingStar.evaluate(KILL_EVENT, stateWith([]))).toBe(false);
  });

  it('does not count ground kills toward the fox types', () => {
    expect(shootingStar.evaluate(KILL_EVENT, stateWith([
      fox1Kill,
      fox2Kill,
      { victimUnitCategory: 'ground', weaponGuidance: 'RADAR_ACTIVE' },
    ]))).toBe(false);
  });

  it('does not count a null-guidance air kill (e.g. gun) toward fox types', () => {
    expect(shootingStar.evaluate(KILL_EVENT, stateWith([
      fox1Kill,
      fox2Kill,
      { victimUnitCategory: 'air', weaponGuidance: null },
    ]))).toBe(false);
  });
});
