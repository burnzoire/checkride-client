// Assemble the DCS-sourced metadata namespace (event_data.metadata) for an event.
//
// The DCS mod sources unit/weapon taxonomy directly from the sim, and that data
// is already present on the raw UDP event in two forms:
//
//  1. GameGUI persisted events (kill, takeoff, landing, crash, eject,
//     pilot_death) carry per-unit DCS attribute lists from
//     DCS.getUnitTypeAttribute(): `killerUnitAttributes`, `victimUnitAttributes`,
//     `unitAttributes`.
//  2. Mission events may carry a richer nested `metadata` object built from
//     getDesc()/getAttributes()/Weapon:getDesc() (unit/weapon/killer/victim).
//
// This folds both into one nested-by-actor object so the API can map it onto the
// resolved event columns. No taxonomy is derived or handcrafted here — it is a
// passthrough of DCS-sourced data. `family` is resolved from backend config keyed
// on the `unit_type` / `weapon_name` the event already carries; the server derives
// domain/role/category from the forwarded attributes.
//
// Additive / non-breaking: it lives in its own event_data.metadata namespace, is
// attached after the event_uid is computed (so existing UIDs are unchanged), and
// is not consumed by the API yet — it runs in parallel with the server-side
// metadata enrichment for now.

// Attach a DCS attribute list under metadata[actor].attributes, preserving any
// fields a Lua-provided metadata object already set for that actor.
function addAttributes(metadata, actor, attributes) {
  if (!Array.isArray(attributes) || attributes.length === 0) return;
  const existing = metadata[actor] && typeof metadata[actor] === "object" ? metadata[actor] : {};
  metadata[actor] = { ...existing, attributes };
}

// Build the compact, DCS-sourced metadata object from a raw UDP event. Returns
// null when the event carries no DCS metadata, so callers can omit the namespace.
function buildEventMetadata(rawEvent) {
  if (!rawEvent || typeof rawEvent !== "object") return null;

  // Seed from any Lua-provided nested metadata (mission enrichment shape).
  const luaMetadata = rawEvent.metadata;
  const metadata =
    luaMetadata && typeof luaMetadata === "object" && !Array.isArray(luaMetadata)
      ? { ...luaMetadata }
      : {};

  // Fold in the DCS attribute lists the GameGUI persisted events already carry.
  addAttributes(metadata, "unit", rawEvent.unitAttributes);
  addAttributes(metadata, "killer", rawEvent.killerUnitAttributes);
  addAttributes(metadata, "victim", rawEvent.victimUnitAttributes);

  return Object.keys(metadata).length > 0 ? metadata : null;
}

module.exports = buildEventMetadata;
module.exports.buildEventMetadata = buildEventMetadata;
