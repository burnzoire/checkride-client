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

  it('marks the matched shot killed (off the in-flight count) and will not re-credit it', () => {
    const { tracker } = makeTracker();
    tracker.recordShot(shot());
    expect(tracker.matchKill({ killerUcid: 'killer-1', victimObjectId: 99 })).not.toBeNull();
    expect(tracker.inFlightCount('killer-1')).toBe(0);
    // A second kill on the same victim must not re-use the already-credited shot.
    expect(tracker.matchKill({ killerUcid: 'killer-1', victimObjectId: 99 })).toBeNull();
    expect(tracker.trackedShots('killer-1')[0].outcome).toBe('killed');
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

describe('WeaponTracker null-object-id attribution (the real DCS case)', () => {
  it('attributes via the hit-backfilled victim id when shots carry no object ids', () => {
    const { tracker } = makeTracker();
    // DCS gives weapons no usable object id, and a LOAL shot has no target lock.
    tracker.recordShot(shot({ weaponObjectId: null, targetObjectId: null, weaponName: 'AGM-114K' }));
    // The hit knows the victim reliably (a unit id) and the weapon name.
    tracker.recordHit({ playerUcid: 'killer-1', weaponObjectId: null, targetObjectId: '5', weaponName: 'AGM-114K' });
    // The kill carries the same victim id, arriving as a number via a different transport.
    const match = tracker.matchKill({ killerUcid: 'killer-1', victimObjectId: 5 });
    expect(match).toEqual({ weaponName: 'AGM-114K', descRaw: { category: 1, guidance: 7 } });
  });

  it('marks the shot hit by weapon name and backfills the victim id when ids are missing', () => {
    const { tracker } = makeTracker();
    tracker.recordShot(shot({ weaponObjectId: null, targetObjectId: null, weaponName: 'AGM-114K' }));
    tracker.recordHit({ playerUcid: 'killer-1', targetObjectId: '5', weaponName: 'AGM-114K', distanceNm: 2.1 });
    const [s] = tracker.trackedShots('killer-1');
    expect(s.outcome).toBe('hit');
    expect(s.distanceNm).toBe(2.1);
    expect(s.targetObjectId).toBe('5');
  });

  it('attributes by the kill weapon name when there is no hit link at all', () => {
    const { tracker } = makeTracker();
    // No hit_enrichment for a lethal kill, and no usable ids — only the shot + the kill.
    tracker.recordShot(shot({ weaponObjectId: null, targetObjectId: null, weaponName: 'AGM_114K', weaponDisplayName: 'AGM-114K' }));
    // The kill carries the GameGUI display name.
    const match = tracker.matchKill({ killerUcid: 'killer-1', weaponName: 'AGM-114K' });
    expect(match.descRaw).toEqual({ category: 1, guidance: 7 });
    expect(tracker.trackedShots('killer-1')[0].outcome).toBe('killed');
  });

  it('computes the launch-to-death engagement range from reliable coordinates', () => {
    const { tracker } = makeTracker();
    // Launch at the origin; victim dies 1852 m east + 1852 m north → ~1.414 nm.
    tracker.recordShot(shot({ weaponObjectId: null, targetObjectId: null, weaponName: 'AGM-114K', startX: 0, startY: 0 }));
    const match = tracker.matchKill({ killerUcid: 'killer-1', weaponName: 'AGM-114K', victimPositionX: 1852, victimPositionY: 1852 });
    expect(match).not.toBeNull();
    expect(tracker.trackedShots('killer-1')[0].distanceNm).toBeCloseTo(Math.SQRT2, 3);
  });

  it('does NOT claim a distance from a fuzzy name match (several same-type shots in flight)', () => {
    const { tracker } = makeTracker();
    // Two AGM-114K in flight from different launch points — a name match can't tell which
    // one hit, so its launch point (and thus distance) is not trustworthy.
    tracker.recordShot(shot({ weaponObjectId: null, targetObjectId: null, weaponName: 'AGM-114K', startX: 0, startY: 0 }));
    tracker.recordShot(shot({ weaponObjectId: null, targetObjectId: null, weaponName: 'AGM-114K', startX: 9000, startY: 9000 }));
    const match = tracker.matchKill({ killerUcid: 'killer-1', weaponName: 'AGM-114K', victimPositionX: 1852, victimPositionY: 1852 });
    expect(match).not.toBeNull(); // weapon/desc still attributed
    const killed = tracker.trackedShots('killer-1').find((s) => s.outcome === 'killed');
    expect(killed.distanceNm).toBeNull(); // but no fabricated distance
  });

  it('does not cross-attribute a kill to a shot that never hit that victim', () => {
    const { tracker } = makeTracker();
    tracker.recordShot(shot({ weaponObjectId: null, targetObjectId: null, weaponName: 'AGM-114K' }));
    tracker.recordHit({ playerUcid: 'killer-1', targetObjectId: '5', weaponName: 'AGM-114K' });
    // A kill on a different victim the weapon never hit: no backfilled match.
    expect(tracker.matchKill({ killerUcid: 'killer-1', victimObjectId: 999 })).toBeNull();
  });
});

describe('WeaponTracker terminal-position proximity', () => {
  const sample = (weaponKey, x, y, ucid = 'killer-1') => ({
    type: 'weapon_sample_enrichment', playerUcid: ucid, weaponKey, positionX: x, positionY: y,
  });

  it('attributes a ripple kill to the weapon whose trajectory ended nearest the victim', () => {
    const { tracker } = makeTracker();
    // Two AGM-114K from different launch points, flying to two different victims.
    tracker.recordShot(shot({ weaponObjectId: null, targetObjectId: null, weaponKey: 'wk-A', weaponName: 'AGM-114K', startX: 0, startY: 0 }));
    tracker.recordShot(shot({ weaponObjectId: null, targetObjectId: null, weaponKey: 'wk-B', weaponName: 'AGM-114K', startX: 10000, startY: 0 }));
    tracker.recordSample(sample('wk-A', 8000, 0)); // A's terminal position
    tracker.recordSample(sample('wk-B', 2000, 0)); // B's terminal position
    // Victim died at (2050,0) — nearest B's terminal position.
    const match = tracker.matchKill({ killerUcid: 'killer-1', weaponName: 'AGM-114K', victimPositionX: 2050, victimPositionY: 0 });
    expect(match).not.toBeNull();
    const killed = tracker.trackedShots('killer-1').find((s) => s.outcome === 'killed');
    expect(killed.weaponKey).toBe('wk-B');
    // Distance from B's launch (10000,0) to death (2050,0) = 7950 m.
    expect(killed.distanceNm).toBeCloseTo(7950 / 1852, 2);
  });

  it('falls back to weapon/desc only (no distance) when no sample placed the shots', () => {
    const { tracker } = makeTracker();
    tracker.recordShot(shot({ weaponObjectId: null, targetObjectId: null, weaponKey: 'wk-A', weaponName: 'AGM-114K', startX: 0, startY: 0 }));
    tracker.recordShot(shot({ weaponObjectId: null, targetObjectId: null, weaponKey: 'wk-B', weaponName: 'AGM-114K', startX: 10000, startY: 0 }));
    const match = tracker.matchKill({ killerUcid: 'killer-1', weaponName: 'AGM-114K', victimPositionX: 2050, victimPositionY: 0 });
    expect(match).not.toBeNull();
    expect(tracker.trackedShots('killer-1').find((s) => s.outcome === 'killed').distanceNm).toBeNull();
  });

  it('rejects an implausibly far nearest shot (the kill was not from a tracked shot)', () => {
    const { tracker } = makeTracker();
    tracker.recordShot(shot({ weaponObjectId: null, targetObjectId: null, weaponKey: 'wk-A', weaponName: 'AGM-114K', startX: 0, startY: 0 }));
    tracker.recordShot(shot({ weaponObjectId: null, targetObjectId: null, weaponKey: 'wk-B', weaponName: 'AGM-114K', startX: 0, startY: 0 }));
    tracker.recordSample(sample('wk-A', 50000, 0));
    tracker.recordSample(sample('wk-B', 60000, 0));
    const match = tracker.matchKill({ killerUcid: 'killer-1', weaponName: 'AGM-114K', victimPositionX: 0, victimPositionY: 0 });
    expect(match).not.toBeNull(); // weapon/desc still attributed
    expect(tracker.trackedShots('killer-1').find((s) => s.outcome === 'killed').distanceNm).toBeNull(); // but no distance
  });
});

describe('WeaponTracker.recordHit', () => {
  it('grounds a hit shot (outcome hit, off the in-flight count) instantly, with distance', () => {
    const { tracker } = makeTracker();
    tracker.recordShot(shot({ weaponObjectId: 201 }));
    expect(tracker.inFlightCount('killer-1')).toBe(1);
    tracker.recordHit({ playerUcid: 'killer-1', weaponObjectId: 201, distanceNm: 3.2 });
    expect(tracker.inFlightCount('killer-1')).toBe(0);
    const [s] = tracker.trackedShots('killer-1');
    expect(s.outcome).toBe('hit');
    expect(s.distanceNm).toBe(3.2);
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

describe('WeaponTracker gun kills', () => {
  const gunStart = (ucid = 'killer-1', weaponName = 'GAU-8') => ({ type: 'gun_burst_start', playerUcid: ucid, weaponName });
  const gunEnd = (ucid = 'killer-1', weaponName = 'GAU-8') => ({ type: 'gun_burst_end', playerUcid: ucid, weaponName });

  it('attributes a weaponless kill to the active gun burst, with the real gun type', () => {
    const { tracker } = makeTracker();
    tracker.recordGunBurst(gunStart());
    expect(tracker.matchGunKill({ killerUcid: 'killer-1' })).toEqual({ weaponName: 'GAU-8', reason: 'gun' });
  });

  it('returns null when there is no gun burst', () => {
    const { tracker } = makeTracker();
    expect(tracker.matchGunKill({ killerUcid: 'killer-1' })).toBeNull();
  });

  it('refrains while a munition is still in the air (ambiguous)', () => {
    const { tracker } = makeTracker();
    tracker.recordGunBurst(gunStart());
    tracker.recordShot(shot()); // a missile still in flight
    expect(tracker.matchGunKill({ killerUcid: 'killer-1' })).toBeNull();
  });

  it('refrains when a rocket/bomb just impacted — submunitions could be the cause', () => {
    const { tracker } = makeTracker();
    tracker.recordGunBurst(gunStart());
    tracker.recordShot(shot({ weaponObjectId: 301, targetObjectId: 55, weaponName: 'CBU-87', weaponDescRaw: { category: 3 } }));
    tracker.recordHit({ playerUcid: 'killer-1', weaponObjectId: 301 }); // dispenser impacts → grounded
    expect(tracker.inFlightCount('killer-1')).toBe(0); // nothing airborne...
    expect(tracker.matchGunKill({ killerUcid: 'killer-1' })).toBeNull(); // ...but still ambiguous
  });

  it('attributes guns once submunition activity ages past the grace window', () => {
    const { tracker, tick } = makeTracker({ gunGraceMs: 5000 });
    tracker.recordGunBurst(gunStart());
    tracker.recordShot(shot({ weaponObjectId: 301, weaponName: 'CBU-87', weaponDescRaw: { category: 3 } }));
    tracker.recordHit({ playerUcid: 'killer-1', weaponObjectId: 301 });
    tick(5001);
    tracker.recordGunBurst(gunStart()); // fresh burst after the cluster settled
    expect(tracker.matchGunKill({ killerUcid: 'killer-1' })).toEqual({ weaponName: 'GAU-8', reason: 'gun' });
  });

  it('honours the grace window after the burst ends', () => {
    const { tracker, tick } = makeTracker({ gunGraceMs: 5000 });
    tracker.recordGunBurst(gunStart());
    tracker.recordGunBurst(gunEnd());
    tick(4999);
    expect(tracker.matchGunKill({ killerUcid: 'killer-1' })).not.toBeNull();
    tick(2); // past grace
    expect(tracker.matchGunKill({ killerUcid: 'killer-1' })).toBeNull();
  });

  it('exposes the current/recent gun burst for telemetry', () => {
    const { tracker } = makeTracker();
    expect(tracker.gunBurst('killer-1')).toBeNull();
    tracker.recordGunBurst(gunStart());
    expect(tracker.gunBurst('killer-1')).toEqual({ weaponName: 'GAU-8', active: true });
  });
});

describe('WeaponTracker impacted lifecycle (delayed death)', () => {
  const sample = (weaponKey, x, y, ucid = 'killer-1') => ({
    type: 'weapon_sample_enrichment', playerUcid: ucid, weaponKey, positionX: x, positionY: y,
  });

  it('moves a sampled shot to impacted when samples stop, freeing the gun gate', () => {
    const { tracker, tick } = makeTracker({ sampleStaleMs: 5000, impactGraceMs: 30000 });
    tracker.recordShot(shot({ weaponKey: 'wk', weaponObjectId: null }));
    tracker.recordSample(sample('wk', 1000, 1000));
    expect(tracker.inFlightCount('killer-1')).toBe(1);
    tick(5001); // position samples stopped → impacted
    expect(tracker.inFlightCount('killer-1')).toBe(0); // no longer blocks the gun gate
    expect(tracker.trackedShots('killer-1')[0].outcome).toBe('impacted');
  });

  it('still credits a kill that lands seconds after impact', () => {
    const { tracker, tick } = makeTracker({ sampleStaleMs: 5000, impactGraceMs: 30000 });
    tracker.recordShot(shot({ weaponKey: 'wk', weaponObjectId: null, targetObjectId: null, weaponName: 'AGM-114K' }));
    tracker.recordSample(sample('wk', 1000, 1000));
    tick(10000); // impacted, within the grace
    const match = tracker.matchKill({ killerUcid: 'killer-1', weaponName: 'AGM-114K' });
    expect(match).not.toBeNull();
    expect(tracker.trackedShots('killer-1')[0].outcome).toBe('killed');
  });

  it('becomes a miss only once the grace lapses with no kill', () => {
    const { tracker, tick } = makeTracker({ sampleStaleMs: 5000, impactGraceMs: 30000 });
    tracker.recordShot(shot({ weaponKey: 'wk' }));
    tracker.recordSample(sample('wk', 1000, 1000));
    tick(29000); // impacted, still attributable
    expect(tracker.trackedShots('killer-1')[0].outcome).toBe('impacted');
    tick(2000); // past the grace
    expect(tracker.trackedShots('killer-1')[0].outcome).toBe('miss');
    expect(tracker.matchKill({ killerUcid: 'killer-1', weaponName: 'AGM-114K' })).toBeNull();
  });
});

describe('WeaponTracker TTL', () => {
  it('turns an unresolved in-flight shot into a miss at the TTL (off the gate, still visible)', () => {
    const { tracker, tick } = makeTracker({ ttlMs: 30000 });
    tracker.recordShot(shot());
    tick(30001);
    expect(tracker.inFlightCount('killer-1')).toBe(0);
    expect(tracker.matchKill({ killerUcid: 'killer-1', victimObjectId: 99 })).toBeNull();
    expect(tracker.trackedShots('killer-1')[0].outcome).toBe('miss'); // still shown as a miss
  });

  it('hard-deletes shots only after the long retention window', () => {
    const { tracker, tick } = makeTracker({ ttlMs: 30000, hardTtlMs: 600000 });
    tracker.recordShot(shot());
    tick(599999);
    expect(tracker.trackedShots('killer-1')).toHaveLength(1);
    tick(2);
    expect(tracker.trackedShots('killer-1')).toHaveLength(0);
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
