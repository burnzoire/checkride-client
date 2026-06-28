// Tracks a player's shots (from mission `shot_enrichment` events) so a kill can be
// attributed to the weapon that hit it. DCS Weapon objects have no reliable object id
// (getID() returns nil) and a LOAL shot has no target lock, so we can't key on the
// weapon. The reliable anchor is the *hit*: its target is the victim unit, whose id is
// solid (and is the same id the kill carries). So the chain is shot →(weapon name)→ hit
// →(backfills victim id onto the shot)→ kill, matched by victim id.
// It also decides gun kills: guns fire no Weapon object, so a gun kill
// arrives weaponless and is attributed from the preceding gun burst — but only when
// guns are the unambiguous explanation (nothing else in the air, no recent
// submunition-dispensing impact). If an unaccounted munition is still airborne, a
// weaponless kill is ambiguous and is left unattributed rather than assumed to be guns.
//
// Two distinct states, deliberately separated:
//   - inFlight   — still in the air; this is what the gun gate counts.
//   - tracked    — we still know its weapon (desc/attrs) so a kill can match it.
// A reported hit drops a shot from *inFlight* but keeps it *tracked*, so the kill that
// follows a lethal hit can still key-match it. Shots leave entirely when matched to a
// kill, or when they age out (a missile that missed and self-destructed must stop
// blocking the gun gate forever).

const DEFAULT_TTL_MS = 30000; // never-sampled fallback: in_flight -> miss after this
// Position samples arrive ~1/s while a weapon flies and stop at impact, so a gap this
// long means the weapon is gone (impacted/self-destructed).
const DEFAULT_SAMPLE_STALE_MS = 5000;
// How long an impacted shot stays attributable for a delayed death before it's a miss.
// Generous: a burning unit can cook off well after the weapon impacted.
const DEFAULT_IMPACT_GRACE_MS = 90000;
// In-flight shots that never resolve become 'miss' at the TTL (so they stop gating
// guns) but stay visible. They're hard-deleted only much later so the telemetry
// "weapons fired" view reflects most of a sortie without growing unbounded.
const DEFAULT_HARD_TTL_MS = 600000;
// Guns produce no Weapon object, so a gun kill arrives weaponless and can't be
// key-matched. We attribute it from the gun burst that immediately preceded it —
// but only within a short grace window after the burst ends, since the kill event
// lands a beat later. 5s is generous enough to keep soft kills from a long strafe.
const DEFAULT_GUN_GRACE_MS = 5000;
const METERS_PER_NM = 1852;
// A weapon's last in-flight sample is at most a sampling-gap short of impact (a fast
// missile covers a few km between samples), so a terminal position farther than this
// from where the victim died is almost certainly a different engagement — don't use it.
const PROXIMITY_MAX_M = 5000;

// Of several candidate shots, the one whose last tracked position is closest to a point
// (where the victim died) — i.e. the weapon that flew there. Null if none has a position
// or the nearest is implausibly far.
function nearestShotToPoint(shots, x, y) {
  if (x == null || y == null) return null;
  let best = null;
  let bestD2 = Infinity;
  for (const s of shots) {
    if (s.lastPositionX == null || s.lastPositionY == null) continue;
    const dx = s.lastPositionX - x;
    const dy = s.lastPositionY - y;
    const d2 = dx * dx + dy * dy;
    if (d2 < bestD2) {
      bestD2 = d2;
      best = s;
    }
  }
  if (!best) return null;
  return bestD2 <= PROXIMITY_MAX_M * PROXIMITY_MAX_M ? best : null;
}

// DCS Weapon.Category: SHELL=0, MISSILE=1, ROCKET=2, BOMB=3. Rockets and bombs can
// dispense submunitions that kill (also weaponlessly) for a few seconds after impact.
const SUBMUNITION_CAPABLE_CATEGORIES = new Set([2, 3]);

// Object ids cross event/transport boundaries as either numbers or strings, so compare
// them stringwise. Both must be present to count as a match.
const idEq = (a, b) => a != null && b != null && String(a) === String(b);

// The kill's weapon name (GameGUI) may be the type name ("AGM_114K") or the display
// name ("AGM-114K"); a shot carries both, so match against either.
const weaponNameMatches = (shot, name) =>
  name != null && (shot.weaponName === name || shot.weaponDisplayName === name);

class WeaponTracker {
  constructor({
    ttlMs = DEFAULT_TTL_MS,
    sampleStaleMs = DEFAULT_SAMPLE_STALE_MS,
    impactGraceMs = DEFAULT_IMPACT_GRACE_MS,
    hardTtlMs = DEFAULT_HARD_TTL_MS,
    gunGraceMs = DEFAULT_GUN_GRACE_MS,
    now = () => Date.now(),
  } = {}) {
    this._ttlMs = ttlMs;
    this._sampleStaleMs = sampleStaleMs;
    this._impactGraceMs = impactGraceMs;
    this._hardTtlMs = hardTtlMs;
    this._gunGraceMs = gunGraceMs;
    this._now = now;
    // ucid -> [{ weaponName, descRaw, weaponObjectId, targetObjectId, firedAtMissionTime,
    //            recordedAt, outcome, groundedAt, distanceNm, lastSampleAt, lastPosition }]
    // outcome lifecycle:
    //   in_flight -> impacted (position samples stopped — the weapon is gone) -> killed
    //   (a kill arrived) | miss (no kill within the grace). 'hit' is set by an explicit
    //   hit_enrichment. A delayed death stays attributable through 'impacted', so a kill
    //   that lands seconds after impact still credits the shot. It is the single source
    //   of weapon state for both attribution and the telemetry display.
    //   A shot that is never position-sampled follows the same shape on a fire-time clock
    //   (in_flight for the TTL, then impacted, then miss) so a long unsampled flight is
    //   not dropped before its kill.
    this._byUcid = new Map();
    // ucid -> { weaponName, startedAt, endedAt, active } — the most recent gun burst.
    this._gunBursts = new Map();
    // weaponName/displayName -> launch-captured getDesc() snapshot. getDesc() is static
    // per weapon type, so a kill can recover its descriptor by name even when its own
    // shot was pruned (long BVR flights) or the lethal hit exposed no weapon to read.
    // Session-lived and shared across pilots — the descriptor depends only on the type.
    this._descByName = new Map();
  }

  // Record an outbound shot. No-op for anything but a shot_enrichment with a ucid.
  recordShot(event) {
    if (!event || event.type !== 'shot_enrichment') return;
    const ucid = event.playerUcid;
    if (!ucid) return;

    this._prune();
    const list = this._byUcid.get(ucid) || [];
    list.push({
      weaponKey: event.weaponKey ?? null, // stable launch key; links the in-flight samples
      weaponName: event.weaponName ?? null,
      weaponDisplayName: event.weaponDisplayName ?? null,
      descRaw: event.weaponDescRaw ?? null,
      weaponObjectId: event.weaponObjectId ?? null, // usually null — DCS weapons have no reliable id
      targetObjectId: event.targetObjectId ?? null, // usually null (LOAL); backfilled on the hit
      startX: event.startX ?? null, // launch point — for the kill-range calc
      startY: event.startY ?? null,
      lastPositionX: null, // updated from in-flight samples; ~impact point at the end
      lastPositionY: null,
      lastSampleAt: null, // when we last saw the weapon alive (a positioned sample)
      firedAtMissionTime: event.firedAt ?? null, // mission time (seconds); context only
      recordedAt: this._now(),
      outcome: 'in_flight',
      groundedAt: null,
      distanceNm: null,
    });
    this._byUcid.set(ucid, list);

    // Cache the descriptor by both names the kill might carry (GameGUI may send the type
    // name or the display name), so it survives this shot being pruned.
    const descRaw = event.weaponDescRaw ?? null;
    if (descRaw != null) {
      if (event.weaponName != null) this._descByName.set(event.weaponName, descRaw);
      if (event.weaponDisplayName != null) this._descByName.set(event.weaponDisplayName, descRaw);
    }
  }

  // Update a tracked shot's last-known position from an in-flight weapon sample. This
  // trajectory is what lets a kill be attributed to the *specific* weapon that flew to
  // the victim (the one whose terminal position is nearest the death point), rather than
  // guessing among same-type shots. No-op for anything but a sample with a known shot.
  recordSample(event) {
    if (!event || event.type !== 'weapon_sample_enrichment') return;
    const list = event.playerUcid && this._byUcid.get(event.playerUcid);
    if (!list || event.weaponKey == null) return;
    const shot = list.find((s) => s.weaponKey != null && s.weaponKey === event.weaponKey);
    if (shot && event.positionX != null && event.positionY != null) {
      shot.lastPositionX = event.positionX;
      shot.lastPositionY = event.positionY;
      shot.lastSampleAt = this._now(); // weapon still alive at this moment
    }
  }

  // Attribute a kill to one of the killer's shots and mark it 'killed'. DCS weapon
  // object ids are unreliable (null for Weapon objects), so the working key is the
  // victim object id, which the *hit* backfilled onto the shot (the hit's target is
  // the victim unit, whose id is reliable — same id the kill carries). Only matches a
  // still-attributable shot (in flight or impacted, not yet credited) so a second kill
  // on the same victim won't re-use it. Returns { weaponName, descRaw } or null.
  matchKill({ killerUcid, victimObjectId = null, weaponObjectId = null, weaponName = null, victimPositionX = null, victimPositionY = null } = {}) {
    this._prune();
    const list = killerUcid && this._byUcid.get(killerUcid);
    if (!list || list.length === 0) return null;

    // A delayed death still credits the shot: in flight, impacted, or hit — anything not
    // already resolved (killed/miss).
    const attributable = (s) => s.outcome === 'in_flight' || s.outcome === 'impacted' || s.outcome === 'hit';
    let shot = null;
    // Whether we pinned THE shot (so its launch point is trustworthy) vs just one shot
    // of the right weapon type (good enough for name/desc, but not for distance).
    let identifiedShot = false;
    if (weaponObjectId != null) {
      shot = list.find((s) => attributable(s) && idEq(s.weaponObjectId, weaponObjectId));
      if (shot) identifiedShot = true;
    }
    if (!shot && victimObjectId != null) {
      shot = list.find((s) => attributable(s) && idEq(s.targetObjectId, victimObjectId));
      if (shot) identifiedShot = true; // backfilled from the hit on this exact victim
    }
    // Usual path: the kill's weapon name (GameGUI, reliable for missiles/bombs). DCS
    // weapon ids are null and lethal hits emit no linking enrichment. Same-name shots
    // share a descriptor, so this reliably yields the weapon + desc_raw.
    if (!shot && weaponName != null) {
      const named = list.filter((s) => attributable(s) && weaponNameMatches(s, weaponName));
      if (named.length === 1) {
        shot = named[0];
        identifiedShot = true; // sole candidate — unambiguous
      } else if (named.length > 1) {
        // Several same-type shots in flight: the one that hit this victim is the one
        // whose trajectory ended nearest the death point. If we can place it, that's a
        // real identification; otherwise fall back to the oldest for weapon/desc only.
        const near = nearestShotToPoint(named, victimPositionX, victimPositionY);
        shot = near || named[0];
        identifiedShot = near != null;
      }
    }
    if (!shot) return null;

    shot.outcome = 'killed';
    // Engagement range = launch point → where the victim died. Both coordinates are
    // reliable, but the launch point is the *specific* shot's — so only claim a distance
    // when we actually identified the shot. A fuzzy name match across several in-flight
    // same-type shots would attach the wrong launch point; leave it blank instead.
    if (identifiedShot && shot.distanceNm == null && shot.startX != null && shot.startY != null && victimPositionX != null && victimPositionY != null) {
      const dx = shot.startX - victimPositionX;
      const dy = shot.startY - victimPositionY;
      shot.distanceNm = Math.sqrt(dx * dx + dy * dy) / METERS_PER_NM;
    }
    return { weaponName: shot.weaponName, descRaw: shot.descRaw };
  }

  // The launch-captured getDesc() snapshot for a weapon type, by type or display name,
  // or null if no shot of it was ever tracked this session. Lets a kill recover its
  // descriptor when its own shot was never matched (pruned long flight / weaponless hit).
  descForWeaponName(name) {
    if (name == null) return null;
    return this._descByName.get(name) ?? null;
  }

  // Record a *confirmed* impact (an explicit hit_enrichment). Marks the shot 'hit' — a
  // terminal-positive state that is never downgraded to a miss — and backfills the hit's
  // reliable target object id (the victim unit) for the kill to key-match. The link is
  // the weapon id, else the weapon name (same-type shots share a descriptor). With NO
  // identifying info (a weaponless hit event) we do NOT guess: flagging an arbitrary shot
  // would mislabel the wrong missile. A confirmed hit can land while still in flight or
  // just after we inferred impact, so both are upgradable.
  recordHit({ playerUcid, weaponObjectId = null, targetObjectId = null, distanceNm = null, weaponName = null } = {}) {
    this._prune();
    const list = playerUcid && this._byUcid.get(playerUcid);
    if (!list || list.length === 0) return;

    const upgradable = (s) => s.outcome === 'in_flight' || s.outcome === 'impacted';
    let shot = null;
    if (weaponObjectId != null) {
      shot = list.find((s) => upgradable(s) && idEq(s.weaponObjectId, weaponObjectId));
    }
    if (!shot && weaponName != null) {
      shot = list.find((s) => upgradable(s) && s.weaponName === weaponName);
    }
    if (!shot) return; // no weapon identity → don't flag a random shot

    shot.outcome = 'hit';
    shot.groundedAt = this._now(); // when its submunitions (if any) start mattering
    if (distanceNm != null) shot.distanceNm = distanceNm;
    // The hit knows the victim reliably; remember it so the kill can attribute.
    if (targetObjectId != null) shot.targetObjectId = targetObjectId;
  }

  // Track a player's gun burst (from gun_burst_start / gun_burst_end). The burst
  // carries the actual gun type so a gun kill is attributed to e.g. "GAU-8", not
  // a generic "gun". No-op without a ucid.
  recordGunBurst(event) {
    if (!event) return;
    const ucid = event.playerUcid;
    if (!ucid) return;
    const now = this._now();

    if (event.type === 'gun_burst_start') {
      this._gunBursts.set(ucid, { weaponName: event.weaponName ?? null, startedAt: now, endedAt: null, active: true });
    } else if (event.type === 'gun_burst_end') {
      const burst = this._gunBursts.get(ucid) || { weaponName: null, startedAt: now };
      burst.weaponName = event.weaponName ?? burst.weaponName;
      burst.active = false;
      burst.endedAt = now;
      this._gunBursts.set(ucid, burst);
    }
  }

  // Decide whether a weaponless kill was a gun kill, returning the gun's weapon name
  // (or null). Conservative by design: only call it guns when guns are the
  // *unambiguous* explanation. Refrains — leaving the kill unattributed — if anything
  // else could be responsible: a munition still airborne, or a rocket/bomb that just
  // impacted and may be spewing submunition kills. Better a false-negative than
  // labelling a missile or cluster kill as guns.
  matchGunKill({ killerUcid } = {}) {
    this._prune();
    if (!killerUcid) return null;

    const burst = this._recentGunBurst(killerUcid);
    if (!burst) return null;
    if (this.inFlightCount(killerUcid) > 0) return null;
    if (this._hasRecentSubmunitionActivity(killerUcid)) return null;

    return { weaponName: burst.weaponName ?? null, reason: 'gun' };
  }

  // The current/recent gun burst for telemetry, or null.
  gunBurst(ucid) {
    this._prune();
    const burst = ucid && this._recentGunBurst(ucid);
    return burst ? { weaponName: burst.weaponName ?? null, active: !!burst.active } : null;
  }

  _recentGunBurst(ucid) {
    const burst = this._gunBursts.get(ucid);
    if (!burst) return null;
    if (burst.active) return burst;
    if (burst.endedAt != null && this._now() - burst.endedAt <= this._gunGraceMs) return burst;
    return null;
  }

  _hasRecentSubmunitionActivity(ucid) {
    const list = this._byUcid.get(ucid);
    if (!list) return false;
    const now = this._now();
    return list.some((s) => {
      if (!s.descRaw || !SUBMUNITION_CAPABLE_CATEGORIES.has(s.descRaw.category)) return false;
      // A rocket/bomb that just impacted may be spewing submunition kills. "Just" = its
      // hit (groundedAt) or its impact (samples stopping, lastSampleAt) was within grace.
      const at = s.groundedAt ?? (s.outcome === 'impacted' ? s.lastSampleAt : null);
      return at != null && now - at <= this._gunGraceMs;
    });
  }

  // How many shots this player still has *in the air* — the gate for the gun-kill rule.
  // Impacted/credited/missed shots don't count.
  inFlightCount(ucid) {
    this._prune();
    const list = ucid && this._byUcid.get(ucid);
    return list ? list.filter((s) => s.outcome === 'in_flight').length : 0;
  }

  // Snapshot of every tracked shot with its outcome — the single weapon dataset the
  // telemetry "weapons fired" view renders.
  trackedShots(ucid) {
    this._prune();
    const list = ucid && this._byUcid.get(ucid);
    return list ? list.map((s) => ({ ...s, inFlight: s.outcome === 'in_flight' })) : [];
  }

  _prune() {
    const now = this._now();
    for (const [ucid, list] of this._byUcid) {
      for (const s of list) {
        if (s.outcome !== 'in_flight' && s.outcome !== 'impacted') continue;
        if (s.lastSampleAt != null) {
          // We saw it fly: position samples stopping means it impacted (stops gating
          // guns); it then stays attributable for a delayed death before becoming a miss.
          const sinceSample = now - s.lastSampleAt;
          if (s.outcome === 'in_flight' && sinceSample > this._sampleStaleMs) s.outcome = 'impacted';
          if (s.outcome === 'impacted' && sinceSample > this._impactGraceMs) s.outcome = 'miss';
        } else {
          // Never sampled (samples never arrived or didn't match this shot). We can't see
          // the impact, so fall back to fire time: keep it 'in_flight' for the TTL (still
          // gating guns), then 'impacted' — off the gun gate but still attributable, so a
          // long unsampled BVR shot stays creditable to its kill (and keeps its
          // launch→death engagement range) — and only a 'miss' once the same grace lapses.
          // Without this a 30s+ flight was dropped before its kill ever landed.
          const sinceFire = now - s.recordedAt;
          if (s.outcome === 'in_flight' && sinceFire > this._ttlMs) s.outcome = 'impacted';
          if (s.outcome === 'impacted' && sinceFire > this._ttlMs + this._impactGraceMs) s.outcome = 'miss';
        }
      }
      const kept = list.filter((s) => now - s.recordedAt <= this._hardTtlMs);
      if (kept.length > 0) this._byUcid.set(ucid, kept);
      else this._byUcid.delete(ucid);
    }
    for (const [ucid, burst] of this._gunBursts) {
      if (!burst.active && burst.endedAt != null && now - burst.endedAt > this._gunGraceMs) {
        this._gunBursts.delete(ucid);
      }
    }
  }
}

module.exports = {
  WeaponTracker,
  DEFAULT_TTL_MS,
  DEFAULT_SAMPLE_STALE_MS,
  DEFAULT_IMPACT_GRACE_MS,
  DEFAULT_HARD_TTL_MS,
  DEFAULT_GUN_GRACE_MS,
};
