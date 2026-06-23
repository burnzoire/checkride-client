// Tracks a player's shots (from mission `shot_enrichment` events) so a kill can be
// attributed to the exact weapon that hit it — an identifier *key-match*, not a
// heuristic. It also answers "does this player still have anything in the air?", which
// gates the (later) gun-kill decision: if an unaccounted munition is airborne, a
// weaponless kill is ambiguous and must not be assumed to be guns.
//
// Two distinct states, deliberately separated:
//   - airborne   — still in the air; this is what the gun gate counts.
//   - tracked    — we still know its weapon (desc/attrs) so a kill can match it.
// A reported hit drops a shot from *airborne* but keeps it *tracked*, so the kill that
// follows a lethal hit can still key-match it. Shots leave entirely when matched to a
// kill, or when they age out (a missile that missed and self-destructed must stop
// blocking the gun gate forever).

const DEFAULT_TTL_MS = 30000;

class WeaponTracker {
  constructor({ ttlMs = DEFAULT_TTL_MS, now = () => Date.now() } = {}) {
    this._ttlMs = ttlMs;
    this._now = now;
    // ucid -> [{ weaponName, descRaw, weaponObjectId, targetObjectId, firedAtMs, recordedAt }]
    this._byUcid = new Map();
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
      airborne: true,
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

  // A shot reported as a hit is no longer airborne, but stays tracked so the kill that
  // follows a lethal hit can still key-match it. Idempotent on already-grounded shots.
  recordHit({ playerUcid, weaponObjectId = null, targetObjectId = null } = {}) {
    this._prune();
    const list = playerUcid && this._byUcid.get(playerUcid);
    if (!list || list.length === 0) return;

    let shot = null;
    if (weaponObjectId != null) {
      shot = list.find((s) => s.airborne && s.weaponObjectId != null && s.weaponObjectId === weaponObjectId);
    }
    if (!shot && targetObjectId != null) {
      shot = list.find((s) => s.airborne && s.targetObjectId != null && s.targetObjectId === targetObjectId);
    }
    if (shot) shot.airborne = false;
  }

  // How many shots this player still has *in the air* — the gate for the gun-kill rule.
  // Already-hit shots don't count.
  inFlightCount(ucid) {
    this._prune();
    const list = ucid && this._byUcid.get(ucid);
    return list ? list.filter((s) => s.airborne).length : 0;
  }

  // Snapshot of all tracked shots (airborne + already-hit) for telemetry/debug.
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
    const cutoff = this._now() - this._ttlMs;
    for (const [ucid, list] of this._byUcid) {
      const kept = list.filter((s) => s.recordedAt >= cutoff);
      if (kept.length > 0) this._byUcid.set(ucid, kept);
      else this._byUcid.delete(ucid);
    }
  }
}

module.exports = { WeaponTracker, DEFAULT_TTL_MS };
