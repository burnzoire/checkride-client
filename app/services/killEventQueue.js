// Queues persisted kill events so the mission script's DCS-sourced weapon/victim
// taxonomy (delivered separately on a persist=false kill_enrichment) can be
// folded onto the kill before it is sent.
//
// The persisted `kill` (GameGUI environment) and its `kill_enrichment` (mission
// environment) arrive as two separate, unordered UDP events. This is a symmetric
// rendezvous keyed by killer ucid: whichever arrives first waits for the other.
// The kill is released — and only then sent — the moment its enrichment arrives,
// or after a short deadline if none does. No kill is ever dropped: AI victims,
// collisions, onHit-missed proximity kills, and mission-scripting-disabled
// servers all legitimately produce no enrichment, and those kills send on the
// deadline with whatever metadata they have.
//
// `kill` drives no achievement evaluation (no dispatch entry in the engine), so
// deferring a kill only delays its API save + summary; nothing else in the
// pipeline depends on its timing.

const DEFAULT_DEADLINE_MS = 2000;
const ENRICHMENT_TTL_MS = 15000;

function compact(obj) {
  const out = {};
  for (const [key, value] of Object.entries(obj)) {
    if (value !== undefined && value !== null) out[key] = value;
  }
  return out;
}

// A kill's initiator is AI (or otherwise unattributable to a player). The mission
// script skips emitting kill_enrichment for AI initiators, so these kills never
// get enrichment and must not be held.
//
// The GameGUI stamps an explicit `killerIsAi` flag at the source — authoritative,
// and it distinguishes a genuine AI participant from a player whose ucid is merely
// unknown. For resilience against older Lua that predates the flag, fall back to
// inferring AI from a missing ucid / "AI" name.
function killerIsAi(event) {
  if (typeof event.killerIsAi === "boolean") return event.killerIsAi;

  const ucid = event.killerUcid ?? event.playerUcid;
  return event.killerName === "AI" || ucid === undefined || ucid === null || ucid === "";
}

// Map a mission kill_enrichment to the nested-by-actor metadata shape, or null
// when it carries no usable taxonomy.
function metadataFromEnrichment(event) {
  const roles =
    Array.isArray(event.victimRoles) && event.victimRoles.length > 0 ? event.victimRoles : null;

  const weapon = compact({
    weapon_class: event.weaponClass ?? null,
    weapon_guidance: event.weaponGuidance ?? null,
    // Raw DCS weapon getDesc() snapshot, forwarded verbatim for the backend to
    // interpret (the name-mapped values above go through unreliable enum tables).
    desc_raw: event.weaponDescRaw ?? null,
  });
  const killer = compact({ category: event.killerUnitCategory ?? null });
  const victim = compact({
    category: event.victimUnitCategory ?? null,
    air_type: event.victimAirType ?? null,
    roles,
  });

  const metadata = {};
  if (Object.keys(weapon).length > 0) metadata.weapon = weapon;
  if (Object.keys(killer).length > 0) metadata.killer = killer;
  if (Object.keys(victim).length > 0) metadata.victim = victim;
  return Object.keys(metadata).length > 0 ? metadata : null;
}

class KillEventQueue {
  constructor({
    deadlineMs = DEFAULT_DEADLINE_MS,
    enrichmentTtlMs = ENRICHMENT_TTL_MS,
    missionScriptingEnabled = () => true,
    now = () => Date.now(),
    schedule,
    cancel,
  } = {}) {
    this._deadlineMs = deadlineMs;
    this._enrichmentTtlMs = enrichmentTtlMs;
    this._missionScriptingEnabled = missionScriptingEnabled;
    this._now = now;
    this._schedule = schedule || ((fn, ms) => setTimeout(fn, ms));
    this._cancel = cancel || ((handle) => clearTimeout(handle));
    this._enrichments = new Map(); // killerUcid -> [{ metadata, victimTypeName, recordedAt }]
    this._pendingKills = new Map(); // killerUcid -> [{ event, release, resolve, timer, victimType }]
  }

  // Buffer a mission kill_enrichment, or release a kill already waiting for it.
  recordEnrichment(event) {
    if (!event || event.type !== "kill_enrichment") return;

    const killerUcid = event.playerUcid;
    if (!killerUcid) return;

    this._pruneEnrichments();

    const entry = {
      metadata: metadataFromEnrichment(event),
      victimTypeName: event.victimTypeName ?? null,
      recordedAt: this._now(),
    };

    const pending = this._takePendingKill(killerUcid, entry.victimTypeName);
    if (pending) {
      this._cancel(pending.timer);
      pending.resolve(this._send(pending.event, pending.release, entry.metadata));
      return;
    }

    const list = this._enrichments.get(killerUcid) || [];
    list.push(entry);
    this._enrichments.set(killerUcid, list);
  }

  // Submit a persisted kill for sending. `release` runs the actual send pipeline
  // and is invoked exactly once. Returns a promise that resolves when the kill is
  // sent (immediately, on enrichment arrival, or on deadline).
  submitKill(event, release) {
    // AI initiator (no enrichment will ever come) or mission scripting off → send
    // now rather than holding until the deadline.
    if (killerIsAi(event) || !this._missionScriptingEnabled()) {
      return this._send(event, release, null);
    }

    // No usable killer ucid → the kill can never be matched to an enrichment
    // (which is keyed by, and dropped without, playerUcid). Holding it would only
    // add the deadline delay for nothing, so send immediately. This restores the
    // pre-`killerIsAi`-flag behavior for players whose ucid is momentarily unknown.
    const killerUcid = event.killerUcid ?? event.playerUcid;
    if (!killerUcid) {
      return this._send(event, release, null);
    }

    this._pruneEnrichments();

    const entry = this._takeEnrichment(killerUcid, event.victimUnitType ?? null);
    if (entry) {
      return this._send(event, release, entry.metadata);
    }

    let resolve;
    const promise = new Promise((r) => {
      resolve = r;
    });
    const pending = {
      event,
      release,
      resolve,
      timer: null,
      victimType: event.victimUnitType ?? null,
    };
    pending.timer = this._schedule(() => {
      this._removePending(killerUcid, pending);
      pending.resolve(this._send(event, release, null)); // deadline: send without metadata
    }, this._deadlineMs);

    const list = this._pendingKills.get(killerUcid) || [];
    list.push(pending);
    this._pendingKills.set(killerUcid, list);
    return promise;
  }

  _send(event, release, metadata) {
    if (metadata) {
      event.metadata = { ...(event.metadata || {}), ...metadata };
    }
    return release();
  }

  // Take a buffered enrichment for this killer, preferring a victim-type match,
  // else oldest (FIFO) so concurrent multi-kills drain in order.
  _takeEnrichment(killerUcid, victimType) {
    const list = this._enrichments.get(killerUcid);
    if (!list || list.length === 0) return null;

    let index = victimType != null ? list.findIndex((e) => e.victimTypeName === victimType) : -1;
    if (index === -1) index = 0;

    const [entry] = list.splice(index, 1);
    if (list.length === 0) this._enrichments.delete(killerUcid);
    return entry;
  }

  _takePendingKill(killerUcid, victimType) {
    const list = this._pendingKills.get(killerUcid);
    if (!list || list.length === 0) return null;

    let index = victimType != null ? list.findIndex((p) => p.victimType === victimType) : -1;
    if (index === -1) index = 0;

    const [pending] = list.splice(index, 1);
    if (list.length === 0) this._pendingKills.delete(killerUcid);
    return pending;
  }

  _removePending(killerUcid, pending) {
    const list = this._pendingKills.get(killerUcid);
    if (!list) return;

    const index = list.indexOf(pending);
    if (index !== -1) list.splice(index, 1);
    if (list.length === 0) this._pendingKills.delete(killerUcid);
  }

  _pruneEnrichments() {
    const cutoff = this._now() - this._enrichmentTtlMs;
    for (const [ucid, list] of this._enrichments) {
      const kept = list.filter((entry) => entry.recordedAt >= cutoff);
      if (kept.length > 0) {
        this._enrichments.set(ucid, kept);
      } else {
        this._enrichments.delete(ucid);
      }
    }
  }
}

module.exports = { KillEventQueue, metadataFromEnrichment, killerIsAi, DEFAULT_DEADLINE_MS, ENRICHMENT_TTL_MS };
