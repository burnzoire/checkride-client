// Queues persisted kill events so the mission script's DCS-sourced weapon/victim
// taxonomy (delivered separately on a persist=false kill_enrichment) can be folded onto
// the kill before it is sent. This is the kill-specific configuration of the shared
// EnrichmentQueue rendezvous (keyed by killer ucid, discriminated by victim type).
//
// No kill is ever dropped: AI victims, collisions, onHit-missed proximity kills, and
// mission-scripting-disabled servers all legitimately produce no enrichment, and those
// kills send on the deadline with whatever metadata they have. `kill` drives no
// achievement evaluation, so deferring a kill only delays its API save + summary.

const {
  EnrichmentQueue,
  compact,
  DEFAULT_DEADLINE_MS,
  DEFAULT_ENRICHMENT_TTL_MS: ENRICHMENT_TTL_MS,
} = require("./enrichmentQueue");

// A kill's initiator is AI (or otherwise unattributable to a player). The mission script
// skips emitting kill_enrichment for AI initiators, so these kills never get enrichment
// and must not be held. The GameGUI stamps an explicit `killerIsAi` flag (authoritative);
// fall back to inferring AI from a missing ucid / "AI" name for older Lua.
function killerIsAi(event) {
  if (typeof event.killerIsAi === "boolean") return event.killerIsAi;

  const ucid = event.killerUcid ?? event.playerUcid;
  return event.killerName === "AI" || ucid === undefined || ucid === null || ucid === "";
}

// Map a mission kill_enrichment to the nested-by-actor metadata shape, or null when it
// carries no usable taxonomy.
function metadataFromEnrichment(event) {
  const roles =
    Array.isArray(event.victimRoles) && event.victimRoles.length > 0 ? event.victimRoles : null;

  // Raw DCS getDesc() snapshot only. The mission script's name-mapped class/guidance go
  // through unreliable enum tables (guidance 7 mislabelled "IR" when it's LASER; a
  // Hellfire's class comes back "OTHER"), so we forward the raw values and let the
  // backend translate. The client merges the authoritative weapon_name on (resolveWeapon).
  const weapon = compact({ desc_raw: event.weaponDescRaw ?? null });
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
    // Client-authoritative weapon attribution. Called at the rendezvous; returns a
    // partial weapon metadata object (e.g. { weapon_name, desc_raw }) to merge, or null.
    resolveWeapon = null,
    now = () => Date.now(),
    schedule,
    cancel,
  } = {}) {
    this._queue = new EnrichmentQueue({
      deadlineMs,
      enrichmentTtlMs,
      now,
      schedule,
      cancel,
      enrichmentType: "kill_enrichment",
      keyOf: (e) => e.killerUcid ?? e.playerUcid,
      metadataFrom: metadataFromEnrichment,
      submitDiscriminatorOf: (e) => e.victimUnitType ?? null,
      enrichmentDiscriminatorOf: (e) => e.victimTypeName ?? null,
      entryExtras: (e) => ({
        victimObjectId: e.victimObjectId ?? null,
        victimPositionX: e.victimPositionX ?? null,
        victimPositionY: e.victimPositionY ?? null,
      }),
      // AI initiator (no enrichment will come) or mission scripting off → don't hold.
      shouldSendImmediately: (e) => killerIsAi(e) || !missionScriptingEnabled(),
      onFold: (event, entry) => {
        if (!resolveWeapon) return;
        const killerUcid = event.killerUcid ?? event.playerUcid;
        if (!killerUcid) return;
        const x = entry && entry.extras;
        const matched = resolveWeapon({
          killerUcid,
          weaponName: event.weaponName ?? event.weapon_name ?? null,
          victimObjectId: (x && x.victimObjectId) ?? null,
          victimPositionX: (x && x.victimPositionX) ?? null,
          victimPositionY: (x && x.victimPositionY) ?? null,
          // Taxonomy already folded onto the kill (metadataFrom ran first) — for diagnostics.
          victimCategory: event.metadata && event.metadata.victim && event.metadata.victim.category,
          killerCategory: event.metadata && event.metadata.killer && event.metadata.killer.category,
        });
        if (matched) {
          event.metadata = event.metadata || {};
          event.metadata.weapon = { ...(event.metadata.weapon || {}), ...matched };
        }
      },
    });
  }

  // Buffer a mission kill_enrichment, or release a kill already waiting for it.
  recordEnrichment(event) {
    return this._queue.recordEnrichment(event);
  }

  // Submit a persisted kill for sending. `release` runs the send pipeline exactly once;
  // returns a promise that resolves when the kill is sent.
  submitKill(event, release) {
    return this._queue.submit(event, release);
  }
}

module.exports = { KillEventQueue, metadataFromEnrichment, killerIsAi, DEFAULT_DEADLINE_MS, ENRICHMENT_TTL_MS };
