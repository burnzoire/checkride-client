const onePassHaulAss = require('./onePassHaulAss');
const PilotState = require('../services/pilotState');

const KILL_EVENT = { type: 'kill_enrichment', playerUcid: 'pilot-1', playerName: 'Maverick' };

function groundKill(killedAtMs, overrides = {}) {
  return {
    victimUnitCategory: 'ground',
    weaponClass: 'BOMB',
    killedAtMs,
    pilotSpeedKts: 450,
    ...overrides,
  };
}

function bombPayload(count) {
  return [{ category: 3, count, typeName: 'MK-82', displayName: 'Mk-82' }];
}

function stateWith(kills, payload = null) {
  const state = new PilotState();
  state.kills = kills;
  state.currentPayload = payload;
  return state;
}

function passKills(n, startTime = 1000, spacing = 2) {
  return Array.from({ length: n }, (_, i) => groundKill(startTime + i * spacing));
}

describe('OnePassHaulAss — metadata', () => {
  it('has id one_pass_haul_ass', () => {
    expect(onePassHaulAss.id).toBe('one_pass_haul_ass');
  });

  it('has triggerType kill_enrichment', () => {
    expect(onePassHaulAss.triggerType).toBe('kill_enrichment');
  });
});

describe('OnePassHaulAss — evaluate', () => {
  it('returns true with 5 ground kills in window, >400kts, bombs expended', () => {
    const state = stateWith(passKills(5), [{ category: 3, count: 0, typeName: 'MK-82', displayName: 'Mk-82' }]);
    expect(onePassHaulAss.evaluate(KILL_EVENT, state)).toBe(true);
  });

  it('returns true with more than 5 kills in the window', () => {
    const state = stateWith(passKills(8), [{ category: 3, count: 0, typeName: 'MK-82', displayName: 'Mk-82' }]);
    expect(onePassHaulAss.evaluate(KILL_EVENT, state)).toBe(true);
  });

  it('returns false with only 4 kills in the window', () => {
    const state = stateWith(passKills(4), [{ category: 3, count: 0, typeName: 'MK-82', displayName: 'Mk-82' }]);
    expect(onePassHaulAss.evaluate(KILL_EVENT, state)).toBe(false);
  });

  it('returns false when kills span more than 30 seconds', () => {
    const spreadKills = [
      groundKill(1000),
      groundKill(1010),
      groundKill(1020),
      groundKill(1035),
      groundKill(1040),
    ];
    const state = stateWith(spreadKills, [{ category: 3, count: 0, typeName: 'MK-82', displayName: 'Mk-82' }]);
    expect(onePassHaulAss.evaluate(KILL_EVENT, state)).toBe(false);
  });

  it('returns true when exactly 5 kills fit within the 30s boundary', () => {
    const kills = [
      groundKill(1000),
      groundKill(1005),
      groundKill(1015),
      groundKill(1025),
      groundKill(1030),
    ];
    const state = stateWith(kills, [{ category: 3, count: 0, typeName: 'MK-82', displayName: 'Mk-82' }]);
    expect(onePassHaulAss.evaluate(KILL_EVENT, state)).toBe(true);
  });

  it('returns false when pilot speed is at or below 400kts', () => {
    const slowKills = passKills(5).map(k => ({ ...k, pilotSpeedKts: 400 }));
    const state = stateWith(slowKills, [{ category: 3, count: 0, typeName: 'MK-82', displayName: 'Mk-82' }]);
    expect(onePassHaulAss.evaluate(KILL_EVENT, state)).toBe(false);
  });

  it('returns false when bombs remain after the pass', () => {
    const state = stateWith(passKills(5), bombPayload(2));
    expect(onePassHaulAss.evaluate(KILL_EVENT, state)).toBe(false);
  });

  it('returns false when payload is null', () => {
    const state = stateWith(passKills(5), null);
    expect(onePassHaulAss.evaluate(KILL_EVENT, state)).toBe(false);
  });

  it('returns false with no kills', () => {
    expect(onePassHaulAss.evaluate(KILL_EVENT, stateWith([]))).toBe(false);
  });

  it('works with rockets as the weapon class', () => {
    const rocketKills = passKills(5).map(k => ({ ...k, weaponClass: 'ROCKET' }));
    const state = stateWith(rocketKills, [{ category: 2, count: 0, typeName: 'Hydra', displayName: 'Hydra 70' }]);
    expect(onePassHaulAss.evaluate(KILL_EVENT, state)).toBe(true);
  });

  it('returns false when rockets remain after a rocket pass', () => {
    const rocketKills = passKills(5).map(k => ({ ...k, weaponClass: 'ROCKET' }));
    const state = stateWith(rocketKills, [{ category: 2, count: 7, typeName: 'Hydra', displayName: 'Hydra 70' }]);
    expect(onePassHaulAss.evaluate(KILL_EVENT, state)).toBe(false);
  });

  it('ignores gun ammo (category 0) in the expended check', () => {
    const state = stateWith(passKills(5), [
      { category: 3, count: 0, typeName: 'MK-82', displayName: 'Mk-82' },
      { category: 0, count: 500, typeName: 'M61A1', displayName: 'M61A1 Vulcan' },
    ]);
    expect(onePassHaulAss.evaluate(KILL_EVENT, state)).toBe(true);
  });

  it('does not count air kills toward the pass', () => {
    const mixed = [
      ...passKills(4),
      { victimUnitCategory: 'air', weaponClass: 'BOMB', killedAtMs: 1005, pilotSpeedKts: 450 },
    ];
    const state = stateWith(mixed, [{ category: 3, count: 0, typeName: 'MK-82', displayName: 'Mk-82' }]);
    expect(onePassHaulAss.evaluate(KILL_EVENT, state)).toBe(false);
  });

  it('finds a qualifying window among multiple passes', () => {
    const pass1 = passKills(3, 1000);
    const pass2 = passKills(5, 2000);
    const state = stateWith([...pass1, ...pass2], [
      { category: 3, count: 0, typeName: 'MK-82', displayName: 'Mk-82' },
    ]);
    expect(onePassHaulAss.evaluate(KILL_EVENT, state)).toBe(true);
  });

  it('returns false when killedAtMs is null', () => {
    const kills = passKills(5).map(k => ({ ...k, killedAtMs: null }));
    const state = stateWith(kills, [{ category: 3, count: 0, typeName: 'MK-82', displayName: 'Mk-82' }]);
    expect(onePassHaulAss.evaluate(KILL_EVENT, state)).toBe(false);
  });
});
