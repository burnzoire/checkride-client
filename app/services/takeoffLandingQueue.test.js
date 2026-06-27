const { createTakeoffLandingQueues, airbaseMetadata } = require("./takeoffLandingQueue");

function fakeTimers() {
  let id = 0;
  const timers = new Map();
  return {
    schedule: (fn) => { const h = ++id; timers.set(h, fn); return h; },
    cancel: (h) => timers.delete(h),
    fireAll: () => { for (const [h, fn] of [...timers]) { timers.delete(h); fn(); } },
    pending: () => timers.size,
  };
}

const make = (opts = {}) => {
  const timers = fakeTimers();
  const queues = createTakeoffLandingQueues({ schedule: timers.schedule, cancel: timers.cancel, ...opts });
  return { ...queues, timers };
};

describe("airbaseMetadata", () => {
  it("namespaces category + name under airbase, dropping nulls", () => {
    expect(airbaseMetadata(2, "CVN-71")).toEqual({ airbase: { category: 2, name: "CVN-71" } });
    expect(airbaseMetadata(0, null)).toEqual({ airbase: { category: 0 } });
    expect(airbaseMetadata(null, null)).toBeNull();
  });
});

describe("takeoff/landing rendezvous", () => {
  it("folds airbaseCategory (FARP) onto a takeoff when the enrichment arrives first", async () => {
    const { takeoffQueue } = make();
    takeoffQueue.recordEnrichment({
      type: "takeoff_enrichment", playerUcid: "p1", airbaseCategory: 1, takeoffLocation: "FARP London",
    });
    const event = { type: "takeoff", playerUcid: "p1" };
    await takeoffQueue.submit(event, () => Promise.resolve("sent"));

    expect(event.metadata).toEqual({ airbase: { category: 1, name: "FARP London" } });
  });

  it("holds a takeoff until its enrichment lands, then folds the carrier category", async () => {
    const { takeoffQueue, timers } = make();
    const event = { type: "takeoff", playerUcid: "p1" };
    const pending = takeoffQueue.submit(event, () => Promise.resolve("sent"));
    expect(timers.pending()).toBe(1);

    takeoffQueue.recordEnrichment({ type: "takeoff_enrichment", playerUcid: "p1", airbaseCategory: 2, takeoffLocation: "CVN-71" });
    await pending;

    expect(event.metadata.airbase).toEqual({ category: 2, name: "CVN-71" });
  });

  it("folds airbaseCategory onto a landing", async () => {
    const { landingQueue } = make();
    landingQueue.recordEnrichment({ type: "landing_enrichment", playerUcid: "p1", airbaseCategory: 0, airdromeName: "Batumi" });
    const event = { type: "landing", playerUcid: "p1" };
    await landingQueue.submit(event, () => Promise.resolve());

    expect(event.metadata.airbase).toEqual({ category: 0, name: "Batumi" });
  });

  it("a takeoff enrichment does not satisfy a landing (separate queues)", async () => {
    const { takeoffQueue, landingQueue, timers } = make();
    takeoffQueue.recordEnrichment({ type: "takeoff_enrichment", playerUcid: "p1", airbaseCategory: 0 });

    const landing = { type: "landing", playerUcid: "p1" };
    landingQueue.submit(landing, () => Promise.resolve());
    expect(timers.pending()).toBe(1); // landing still waiting; the takeoff enrichment didn't release it
  });

  it("sends a takeoff immediately when mission scripting is off", async () => {
    const { takeoffQueue, timers } = make({ missionScriptingEnabled: () => false });
    const release = jest.fn(() => Promise.resolve());
    await takeoffQueue.submit({ type: "takeoff", playerUcid: "p1" }, release);
    expect(release).toHaveBeenCalledTimes(1);
    expect(timers.pending()).toBe(0);
  });

  it("releases on the deadline with no metadata if no enrichment comes", async () => {
    const { takeoffQueue, timers } = make();
    const event = { type: "takeoff", playerUcid: "p1" };
    const pending = takeoffQueue.submit(event, () => Promise.resolve());
    timers.fireAll();
    await pending;
    expect(event).not.toHaveProperty("metadata");
  });
});
