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

const DEFAULT_TTL_MS = 30000;
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
  constructor({ ttlMs = DEFAULT_TTL_MS, hardTtlMs = DEFAULT_HARD_TTL_MS, gunGraceMs = DEFAULT_GUN_GRACE_MS, now = () => Date.now() } = {}) {
    this._ttlMs = ttlMs;
    this._hardTtlMs = hardTtlMs;
    this._gunGraceMs = gunGraceMs;
    this._now = now;
    // ucid -> [{ weaponName, descRaw, weaponObjectId, targetObjectId, firedAtMs,
    //            recordedAt, outcome, groundedAt, distanceNm }]
    // outcome: 'in_flight' -> 'hit' (impact) -> 'killed' (attributed to a kill); or
    // 'miss' once an unresolved in-flight shot ages past the TTL. It is the single
    // source of weapon state for both attribution and the telemetry display.
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
      weaponDisplayName: event.weaponDisplayName ?? null,
      descRaw: event.weaponDescRaw ?? null,
      weaponObjectId: event.weaponObjectId ?? null, // usually null — DCS weapons have no reliable id
      targetObjectId: event.targetObjectId ?? null, // usually null (LOAL); backfilled on the hit
      startX: event.startX ?? null, // launch point — for the kill-range calc
      startY: event.startY ?? null,
      firedAtMs: event.firedAt ?? null, // mission time, carried for context only
      recordedAt: this._now(),
      outcome: 'in_flight',
      groundedAt: null,
      distanceNm: null,
    });
    this._byUcid.set(ucid, list);
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

    const attributable = (s) => s.outcome === 'in_flight' || s.outcome === 'hit';
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
    // share a descriptor, so this reliably yields the weapon + desc_raw — but it does
    // NOT identify which shot, so it's only "the" shot when it's the sole candidate.
    if (!shot && weaponName != null) {
      const named = list.filter((s) => attributable(s) && weaponNameMatches(s, weaponName));
      shot = named[0] || null;
      if (named.length === 1) identifiedShot = true;
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

  // Record an impact. Links the hit to its shot so the shot can be marked hit and,
  // crucially, so the hit's *reliable* target object id (the victim unit) is backfilled
  // onto the shot for the kill to key-match later. Weapon ids being null, the shot↔hit
  // link falls back to the weapon name (same-type shots share descriptors, so this is
  // safe for attribution), then to the oldest in-flight shot. The shot stays tracked.
  recordHit({ playerUcid, weaponObjectId = null, targetObjectId = null, distanceNm = null, weaponName = null } = {}) {
    this._prune();
    const list = playerUcid && this._byUcid.get(playerUcid);
    if (!list || list.length === 0) return;

    const inFlight = (s) => s.outcome === 'in_flight';
    let shot = null;
    if (weaponObjectId != null) {
      shot = list.find((s) => inFlight(s) && idEq(s.weaponObjectId, weaponObjectId));
    }
    if (!shot && weaponName != null) {
      shot = list.find((s) => inFlight(s) && s.weaponName === weaponName);
    }
    if (!shot) {
      shot = list.find(inFlight); // oldest in-flight shot
    }
    if (shot) {
      shot.outcome = 'hit';
      shot.groundedAt = this._now(); // when its submunitions (if any) start mattering
      if (distanceNm != null) shot.distanceNm = distanceNm;
      // The hit knows the victim reliably; remember it so the kill can attribute.
      if (targetObjectId != null) shot.targetObjectId = targetObjectId;
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
        (s.outcome === 'hit' || s.outcome === 'killed') &&
        s.groundedAt != null &&
        now - s.groundedAt <= this._gunGraceMs &&
        s.descRaw &&
        SUBMUNITION_CAPABLE_CATEGORIES.has(s.descRaw.category)
    );
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
        // An in-flight shot that never resolved is a miss once it ages out — it stops
        // gating guns but stays visible in the weapons view.
        if (s.outcome === 'in_flight' && now - s.recordedAt > this._ttlMs) {
          s.outcome = 'miss';
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

module.exports = { WeaponTracker, DEFAULT_TTL_MS, DEFAULT_HARD_TTL_MS, DEFAULT_GUN_GRACE_MS };
