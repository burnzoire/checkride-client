const { EnrichmentQueue, compact } = require("./enrichmentQueue");

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

// A minimal generic config: persisted `event` keyed by ucid, `event_enrichment` carrying
// a `tag` folded as metadata.foo.
const makeQueue = (opts = {}) => {
  const timers = fakeTimers();
  const queue = new EnrichmentQueue({
    schedule: timers.schedule,
    cancel: timers.cancel,
    enrichmentType: "event_enrichment",
    keyOf: (e) => e.playerUcid,
    metadataFrom: (e) => (e.tag != null ? { foo: { tag: e.tag } } : null),
    ...opts,
  });
  return { queue, timers };
};

describe("compact", () => {
  it("drops null/undefined, keeps everything else", () => {
    expect(compact({ a: 1, b: null, c: undefined, d: 0, e: false, f: "" })).toEqual({ a: 1, d: 0, e: false, f: "" });
  });
});

describe("EnrichmentQueue rendezvous", () => {
  it("sends immediately with metadata when the enrichment arrived first", async () => {
    const { queue, timers } = makeQueue();
    const release = jest.fn(() => Promise.resolve("sent"));

    queue.recordEnrichment({ type: "event_enrichment", playerUcid: "p1", tag: "x" });
    const event = { type: "event", playerUcid: "p1" };
    const result = await queue.submit(event, release);

    expect(result).toBe("sent");
    expect(release).toHaveBeenCalledTimes(1);
    expect(timers.pending()).toBe(0);
    expect(event.metadata).toEqual({ foo: { tag: "x" } });
  });

  it("holds the event until a later enrichment releases it with metadata", async () => {
    const { queue, timers } = makeQueue();
    const release = jest.fn(() => Promise.resolve("sent"));

    const event = { type: "event", playerUcid: "p1" };
    const pending = queue.submit(event, release);

    expect(release).not.toHaveBeenCalled();
    expect(timers.pending()).toBe(1);

    queue.recordEnrichment({ type: "event_enrichment", playerUcid: "p1", tag: "y" });

    await expect(pending).resolves.toBe("sent");
    expect(timers.pending()).toBe(0); // deadline cancelled
    expect(event.metadata).toEqual({ foo: { tag: "y" } });
  });

  it("releases without metadata when the deadline trips", async () => {
    const { queue, timers } = makeQueue();
    const release = jest.fn(() => Promise.resolve("sent"));
    const event = { type: "event", playerUcid: "p1" };
    const pending = queue.submit(event, release);

    timers.fireAll();

    await expect(pending).resolves.toBe("sent");
    expect(event).not.toHaveProperty("metadata");
  });

  it("sends immediately (no hold) when shouldSendImmediately is true", async () => {
    const { queue, timers } = makeQueue({ shouldSendImmediately: () => true });
    const release = jest.fn(() => Promise.resolve());
    await queue.submit({ type: "event", playerUcid: "p1" }, release);
    expect(release).toHaveBeenCalledTimes(1);
    expect(timers.pending()).toBe(0);
  });

  it("sends immediately when there is no key to rendezvous on", async () => {
    const { queue, timers } = makeQueue();
    const release = jest.fn(() => Promise.resolve());
    await queue.submit({ type: "event", playerUcid: "" }, release);
    expect(release).toHaveBeenCalledTimes(1);
    expect(timers.pending()).toBe(0);
  });

  it("ignores enrichments of the wrong type or without a key", () => {
    const { queue, timers } = makeQueue();
    queue.recordEnrichment({ type: "other", playerUcid: "p1", tag: "x" });
    queue.recordEnrichment({ type: "event_enrichment", playerUcid: null, tag: "x" });

    const release = jest.fn(() => Promise.resolve());
    queue.submit({ type: "event", playerUcid: "p1" }, release);
    expect(release).not.toHaveBeenCalled(); // nothing buffered → holds
    expect(timers.pending()).toBe(1);
  });

  it("matches by discriminator, not just FIFO", async () => {
    const { queue } = makeQueue({
      submitDiscriminatorOf: (e) => e.which ?? null,
      enrichmentDiscriminatorOf: (e) => e.which ?? null,
    });
    queue.recordEnrichment({ type: "event_enrichment", playerUcid: "p1", which: "a", tag: "A" });
    queue.recordEnrichment({ type: "event_enrichment", playerUcid: "p1", which: "b", tag: "B" });

    const event = { type: "event", playerUcid: "p1", which: "b" };
    await queue.submit(event, () => Promise.resolve());
    expect(event.metadata.foo.tag).toBe("B");
  });

  it("runs onFold with the paired entry's extras (and null on a bare send)", async () => {
    const seen = [];
    const { queue, timers } = makeQueue({
      entryExtras: (e) => ({ note: e.note ?? null }),
      onFold: (event, entry) => seen.push(entry ? entry.extras.note : null),
    });

    queue.recordEnrichment({ type: "event_enrichment", playerUcid: "p1", tag: "x", note: "hi" });
    await queue.submit({ type: "event", playerUcid: "p1" }, () => Promise.resolve());

    const pending = queue.submit({ type: "event", playerUcid: "p2" }, () => Promise.resolve());
    timers.fireAll(); // deadline → entry null
    await pending;

    expect(seen).toEqual(["hi", null]);
  });

  it("expires buffered enrichments after the TTL", () => {
    let clock = 1000;
    const { queue, timers } = makeQueue({ enrichmentTtlMs: 5000, now: () => clock });
    queue.recordEnrichment({ type: "event_enrichment", playerUcid: "p1", tag: "x" });
    clock += 6000;

    const release = jest.fn(() => Promise.resolve());
    queue.submit({ type: "event", playerUcid: "p1" }, release);
    expect(release).not.toHaveBeenCalled(); // expired → holds
    expect(timers.pending()).toBe(1);
  });
});
