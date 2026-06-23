const { WeaponTracker } = require('./weaponTracker');

const shot = (overrides = {}) => ({
  type: 'shot_enrichment',
  playerUcid: 'killer-1',
  weaponName: 'AGM-114K',
  weaponDescRaw: { category: 1, guidance: 7 },
  weaponObjectId: 201,
  targetObjectId: 99,
  firedAt: 100,
  ...overrides,
});

// Controllable clock so TTL is deterministic.
const makeTracker = (opts = {}) => {
  let clock = 0;
  const tracker = new WeaponTracker({ now: () => clock, ...opts });
  return { tracker, tick: (ms) => { clock += ms; } };
};

describe('WeaponTracker.recordShot', () => {
  it('ignores non-shot events and shots without a ucid', () => {
    const { tracker } = makeTracker();
    tracker.recordShot({ type: 'kill', playerUcid: 'killer-1' });
    tracker.recordShot(shot({ playerUcid: null }));
    expect(tracker.inFlightCount('killer-1')).toBe(0);
  });

  it('tracks an in-flight shot per ucid', () => {
    const { tracker } = makeTracker();
    tracker.recordShot(shot());
    expect(tracker.inFlightCount('killer-1')).toBe(1);
    expect(tracker.inFlightCount('killer-2')).toBe(0);
  });
});

describe('WeaponTracker.matchKill', () => {
  it('key-matches by victim object id and returns the weapon', () => {
    const { tracker } = makeTracker();
    tracker.recordShot(shot());
    const match = tracker.matchKill({ killerUcid: 'killer-1', victimObjectId: 99 });
    expect(match).toEqual({ weaponName: 'AGM-114K', descRaw: { category: 1, guidance: 7 } });
  });

  it('consumes the matched shot (removes it from in-flight)', () => {
    const { tracker } = makeTracker();
    tracker.recordShot(shot());
    tracker.matchKill({ killerUcid: 'killer-1', victimObjectId: 99 });
    expect(tracker.inFlightCount('killer-1')).toBe(0);
  });

  it('prefers weapon object id over victim object id', () => {
    const { tracker } = makeTracker();
    tracker.recordShot(shot({ weaponObjectId: 201, targetObjectId: 99, weaponName: 'AIM-120C' }));
    tracker.recordShot(shot({ weaponObjectId: 202, targetObjectId: 99, weaponName: 'AIM-9X' }));
    const match = tracker.matchKill({ killerUcid: 'killer-1', victimObjectId: 99, weaponObjectId: 202 });
    expect(match.weaponName).toBe('AIM-9X');
    expect(tracker.inFlightCount('killer-1')).toBe(1); // the other shot is still inFlight
  });

  it('returns null when nothing matches the victim', () => {
    const { tracker } = makeTracker();
    tracker.recordShot(shot({ targetObjectId: 99 }));
    expect(tracker.matchKill({ killerUcid: 'killer-1', victimObjectId: 12345 })).toBeNull();
    expect(tracker.inFlightCount('killer-1')).toBe(1); // not consumed
  });

  it('ripple fire: matches the shot aimed at the victim, leaving the others inFlight', () => {
    const { tracker } = makeTracker();
    tracker.recordShot(shot({ weaponObjectId: 1, targetObjectId: 11, weaponName: 'AGM-114K #1' }));
    tracker.recordShot(shot({ weaponObjectId: 2, targetObjectId: 22, weaponName: 'AGM-114K #2' }));
    tracker.recordShot(shot({ weaponObjectId: 3, targetObjectId: 33, weaponName: 'AGM-114K #3' }));

    const match = tracker.matchKill({ killerUcid: 'killer-1', victimObjectId: 22 });
    expect(match.weaponName).toBe('AGM-114K #2');
    expect(tracker.inFlightCount('killer-1')).toBe(2);
  });
});

describe('WeaponTracker.recordHit', () => {
  it('grounds a hit shot so it no longer counts as inFlight', () => {
    const { tracker } = makeTracker();
    tracker.recordShot(shot({ weaponObjectId: 201 }));
    expect(tracker.inFlightCount('killer-1')).toBe(1);
    tracker.recordHit({ playerUcid: 'killer-1', weaponObjectId: 201 });
    expect(tracker.inFlightCount('killer-1')).toBe(0);
  });

  it('keeps a hit shot tracked so the following lethal kill still matches it', () => {
    const { tracker } = makeTracker();
    tracker.recordShot(shot({ weaponObjectId: 201, targetObjectId: 99, weaponName: 'AGM-114K' }));
    // Lethal hit: hit_enrichment arrives before the kill, grounding the shot...
    tracker.recordHit({ playerUcid: 'killer-1', weaponObjectId: 201, targetObjectId: 99 });
    expect(tracker.inFlightCount('killer-1')).toBe(0);
    // ...but the kill can still attribute to it.
    const match = tracker.matchKill({ killerUcid: 'killer-1', victimObjectId: 99 });
    expect(match.weaponName).toBe('AGM-114K');
  });
});

describe('WeaponTracker TTL', () => {
  it('evicts shots that are never consumed (missed and self-destructed)', () => {
    const { tracker, tick } = makeTracker({ ttlMs: 30000 });
    tracker.recordShot(shot());
    tick(30001);
    expect(tracker.inFlightCount('killer-1')).toBe(0);
    expect(tracker.matchKill({ killerUcid: 'killer-1', victimObjectId: 99 })).toBeNull();
  });

  it('keeps shots that are still within the window', () => {
    const { tracker, tick } = makeTracker({ ttlMs: 30000 });
    tracker.recordShot(shot());
    tick(29999);
    expect(tracker.inFlightCount('killer-1')).toBe(1);
  });
});

describe('WeaponTracker.trackedShots', () => {
  it('returns a snapshot (inFlight + grounded) without mutating state', () => {
    const { tracker } = makeTracker();
    tracker.recordShot(shot({ weaponObjectId: 201 }));
    tracker.recordShot(shot({ weaponObjectId: 202, targetObjectId: 88 }));
    tracker.recordHit({ playerUcid: 'killer-1', weaponObjectId: 201 });

    const snap = tracker.trackedShots('killer-1');
    expect(snap).toHaveLength(2);
    expect(snap.filter((s) => s.inFlight)).toHaveLength(1);

    snap[0].weaponName = 'mutated';
    expect(tracker.trackedShots('killer-1')[0].weaponName).toBe('AGM-114K');
  });
});
