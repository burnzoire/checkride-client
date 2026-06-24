// Tracks a player's shots (from mission `shot_enrichment` events) so a kill can be
// attributed to the exact weapon that hit it — an identifier *key-match*, not a
// heuristic. It also decides gun kills: guns fire no Weapon object, so a gun kill
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

const DEFAULT_TTL_MS = 30000;
// Guns produce no Weapon object, so a gun kill arrives weaponless and can't be
// key-matched. We attribute it from the gun burst that immediately preceded it —
// but only within a short grace window after the burst ends, since the kill event
// lands a beat later. 5s is generous enough to keep soft kills from a long strafe.
const DEFAULT_GUN_GRACE_MS = 5000;

// DCS Weapon.Category: SHELL=0, MISSILE=1, ROCKET=2, BOMB=3. Rockets and bombs can
// dispense submunitions that kill (also weaponlessly) for a few seconds after impact.
const SUBMUNITION_CAPABLE_CATEGORIES = new Set([2, 3]);

class WeaponTracker {
  constructor({ ttlMs = DEFAULT_TTL_MS, gunGraceMs = DEFAULT_GUN_GRACE_MS, now = () => Date.now() } = {}) {
    this._ttlMs = ttlMs;
    this._gunGraceMs = gunGraceMs;
    this._now = now;
    // ucid -> [{ weaponName, descRaw, weaponObjectId, targetObjectId, firedAtMs, recordedAt, inFlight, groundedAt }]
    this._byUcid = new Map();
    // ucid -> { weaponName, startedAt, endedAt, active } — the most recent gun burst.
    this._gunBursts = new Map();
  }

  // Record an outbound shot. No-op for anything but a shot_enrichment with a ucid.
  recordShot(event) {
    if (!event || event.type !== 'shot_enrichment') return;
    const ucid = event.playerUcid;
    if (!ucid) return;

    this._prune();
    const list = this._byUcid.get(ucid) || [];
    list.push({
      weaponName: event.weaponName ?? null,
      descRaw: event.weaponDescRaw ?? null,
      weaponObjectId: event.weaponObjectId ?? null,
      targetObjectId: event.targetObjectId ?? null,
      firedAtMs: event.firedAt ?? null, // mission time, carried for context only
      recordedAt: this._now(),
      inFlight: true,
    });
    this._byUcid.set(ucid, list);
  }

  // Key-match a kill to one of the killer's in-flight shots and consume it. Prefer the
  // weapon object id (exact), else the victim object id (the shot was aimed here).
  // Returns { weaponName, descRaw } or null when nothing matches.
  matchKill({ killerUcid, victimObjectId = null, weaponObjectId = null } = {}) {
    this._prune();
    const list = killerUcid && this._byUcid.get(killerUcid);
    if (!list || list.length === 0) return null;

    let index = -1;
    if (weaponObjectId != null) {
      index = list.findIndex((s) => s.weaponObjectId != null && s.weaponObjectId === weaponObjectId);
    }
    if (index === -1 && victimObjectId != null) {
      index = list.findIndex((s) => s.targetObjectId != null && s.targetObjectId === victimObjectId);
    }
    if (index === -1) return null;

    return this._take(killerUcid, list, index);
  }

  // A shot reported as a hit is no longer in flight, but stays tracked so the kill that
  // follows a lethal hit can still key-match it. Idempotent on already-grounded shots.
  recordHit({ playerUcid, weaponObjectId = null, targetObjectId = null } = {}) {
    this._prune();
    const list = playerUcid && this._byUcid.get(playerUcid);
    if (!list || list.length === 0) return;

    let shot = null;
    if (weaponObjectId != null) {
      shot = list.find((s) => s.inFlight && s.weaponObjectId != null && s.weaponObjectId === weaponObjectId);
    }
    if (!shot && targetObjectId != null) {
      shot = list.find((s) => s.inFlight && s.targetObjectId != null && s.targetObjectId === targetObjectId);
    }
    if (shot) {
      shot.inFlight = false;
      shot.groundedAt = this._now(); // when its submunitions (if any) start mattering
    }
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
    return list.some(
      (s) =>
        !s.inFlight &&
        s.groundedAt != null &&
        now - s.groundedAt <= this._gunGraceMs &&
        s.descRaw &&
        SUBMUNITION_CAPABLE_CATEGORIES.has(s.descRaw.category)
    );
  }

  // How many shots this player still has *in the air* — the gate for the gun-kill rule.
  // Already-hit shots don't count.
  inFlightCount(ucid) {
    this._prune();
    const list = ucid && this._byUcid.get(ucid);
    return list ? list.filter((s) => s.inFlight).length : 0;
  }

  // Snapshot of all tracked shots (inFlight + already-hit) for telemetry/debug.
  trackedShots(ucid) {
    this._prune();
    const list = ucid && this._byUcid.get(ucid);
    return list ? list.map((s) => ({ ...s })) : [];
  }

  _take(ucid, list, index) {
    const [shot] = list.splice(index, 1);
    if (list.length === 0) this._byUcid.delete(ucid);
    return { weaponName: shot.weaponName, descRaw: shot.descRaw };
  }

  _prune() {
    const now = this._now();
    const cutoff = now - this._ttlMs;
    for (const [ucid, list] of this._byUcid) {
      const kept = list.filter((s) => s.recordedAt >= cutoff);
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

module.exports = { WeaponTracker, DEFAULT_TTL_MS, DEFAULT_GUN_GRACE_MS };
