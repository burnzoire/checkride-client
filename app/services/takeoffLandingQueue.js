// Takeoff/landing configurations of the shared EnrichmentQueue: the persisted
// `takeoff`/`landing` events (GameGUI, reliable identity) rendezvous with the mission
// `takeoff_enrichment`/`landing_enrichment` (which carry the DCS Airbase.Category the
// GameGUI environment can't read) and fold the airbase taxonomy onto event.metadata.
//
// Simpler than kills: one event per player, so the rendezvous is plain FIFO by ucid.

const { EnrichmentQueue, compact } = require("./enrichmentQueue");

// DCS Airbase.Category (AIRDROME=0, HELIPAD/FARP=1, SHIP=2) is forwarded raw; the backend
// translates. `name` is the airbase/carrier name the mission resolved.
function airbaseMetadata(category, name) {
  const airbase = compact({ category, name });
  return Object.keys(airbase).length > 0 ? { airbase } : null;
}

function createTakeoffLandingQueues({
  missionScriptingEnabled = () => true,
  now = () => Date.now(),
  schedule,
  cancel,
} = {}) {
  const common = {
    now,
    schedule,
    cancel,
    keyOf: (e) => e.playerUcid,
    // Mission scripting off → no enrichment will ever come; don't wait the deadline.
    shouldSendImmediately: () => !missionScriptingEnabled(),
  };

  const takeoffQueue = new EnrichmentQueue({
    ...common,
    enrichmentType: "takeoff_enrichment",
    metadataFrom: (e) => airbaseMetadata(e.airbaseCategory, e.takeoffLocation),
  });

  const landingQueue = new EnrichmentQueue({
    ...common,
    enrichmentType: "landing_enrichment",
    metadataFrom: (e) => airbaseMetadata(e.airbaseCategory, e.airdromeName),
  });

  return { takeoffQueue, landingQueue };
}

module.exports = { createTakeoffLandingQueues, airbaseMetadata };
