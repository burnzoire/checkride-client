const { KillEventQueue, metadataFromEnrichment, killerIsAi } = require("./killEventQueue");

const enrichment = (overrides = {}) => ({
  type: "kill_enrichment",
  source: "mission",
  playerUcid: "killer-1",
  victimTypeName: "MiG-29A",
  victimUnitCategory: "air",
  victimAirType: "AIRPLANE",
  killerUnitCategory: "AIRPLANE",
  victimRoles: [],
  weaponGuidance: "RADAR_ACTIVE",
  weaponClass: "AAM",
  ...overrides,
});

const kill = (overrides = {}) => ({
  type: "kill",
  killerUcid: "killer-1",
  victimUnitType: "MiG-29A",
  weaponName: "AIM-120C",
  ...overrides,
});

// Controllable scheduler so deadline behaviour is deterministic in tests.
function fakeTimers() {
  let id = 0;
  const timers = new Map();
  return {
    schedule: (fn) => {
      const handle = ++id;
      timers.set(handle, fn);
      return handle;
    },
    cancel: (handle) => timers.delete(handle),
    fire: (handle) => {
      const fn = timers.get(handle);
      timers.delete(handle);
      fn();
    },
    fireAll: () => {
      for (const [handle, fn] of [...timers]) {
        timers.delete(handle);
        fn();
      }
    },
    pending: () => timers.size,
  };
}

const makeQueue = (opts = {}) => {
  const timers = fakeTimers();
  const queue = new KillEventQueue({
    schedule: timers.schedule,
    cancel: timers.cancel,
    ...opts,
  });
  return { queue, timers };
};

describe("metadataFromEnrichment", () => {
  it("maps weapon/killer/victim taxonomy and drops null fields", () => {
    expect(metadataFromEnrichment(enrichment({ victimRoles: ["Fighters"] }))).toEqual({
      weapon: { weapon_class: "AAM", weapon_guidance: "RADAR_ACTIVE" },
      killer: { category: "AIRPLANE" },
      victim: { category: "air", air_type: "AIRPLANE", roles: ["Fighters"] },
    });
  });

  it("forwards the raw weapon descriptor snapshot verbatim", () => {
    const descRaw = {
      category: 1,
      missileCategory: 6,
      guidance: 7,
      displayName: "AGM-114K Hellfire",
      warheadMass: 8,
    };
    const md = metadataFromEnrichment(enrichment({ weaponDescRaw: descRaw }));
    expect(md.weapon).toEqual({
      weapon_class: "AAM",
      weapon_guidance: "RADAR_ACTIVE",
      desc_raw: descRaw,
    });
  });

  it("returns null when no taxonomy is present", () => {
    expect(
      metadataFromEnrichment({
        type: "kill_enrichment",
        weaponClass: null,
        weaponGuidance: null,
        killerUnitCategory: null,
        victimUnitCategory: null,
        victimAirType: null,
        victimRoles: [],
      })
    ).toBeNull();
  });
});

describe("killerIsAi", () => {
  it("honours the explicit killerIsAi flag from the Lua source", () => {
    expect(killerIsAi({ type: "kill", killerIsAi: true, killerUcid: "" })).toBe(true);
    // Explicit flag wins even if a ucid happens to be present.
    expect(killerIsAi({ type: "kill", killerIsAi: false, killerUcid: "x" })).toBe(false);
    expect(killerIsAi({ type: "kill", killerIsAi: false, killerUcid: "" })).toBe(false);
  });

  it("falls back to inferring AI from a missing ucid for older Lua", () => {
    expect(killerIsAi({ type: "kill", killerUcid: "" })).toBe(true);
    expect(killerIsAi({ type: "kill", killerUcid: null })).toBe(true);
    expect(killerIsAi({ type: "kill" })).toBe(true);
    expect(killerIsAi({ type: "kill", killerName: "AI", killerUcid: "" })).toBe(true);
  });

  it("is false when the initiator is a real player", () => {
    expect(killerIsAi({ type: "kill", killerUcid: "killer-1" })).toBe(false);
    expect(killerIsAi({ type: "kill", playerUcid: "killer-1" })).toBe(false);
  });
});

describe("KillEventQueue", () => {
  it("sends an AI-initiated kill immediately without holding (no enrichment comes)", async () => {
    const { queue, timers } = makeQueue();
    const release = jest.fn(() => Promise.resolve("sent"));

    const event = { type: "kill", killerIsAi: true, killerName: "AI", killerUcid: "", victimUcid: "victim-1" };
    await queue.submitKill(event, release);

    expect(release).toHaveBeenCalledTimes(1);
    expect(timers.pending()).toBe(0);
    expect(event).not.toHaveProperty("metadata");
  });

  it("sends immediately, attaching metadata, when the enrichment arrived first", async () => {
    const { queue, timers } = makeQueue();
    const release = jest.fn(() => Promise.resolve("sent"));

    queue.recordEnrichment(enrichment({ victimRoles: ["Fighters"] }));
    const event = kill();
    const result = await queue.submitKill(event, release);

    expect(result).toBe("sent");
    expect(release).toHaveBeenCalledTimes(1);
    expect(timers.pending()).toBe(0); // no deadline timer needed
    expect(event.metadata).toEqual({
      weapon: { weapon_class: "AAM", weapon_guidance: "RADAR_ACTIVE" },
      killer: { category: "AIRPLANE" },
      victim: { category: "air", air_type: "AIRPLANE", roles: ["Fighters"] },
    });
  });

  it("holds the kill until a later enrichment releases it with metadata", async () => {
    const { queue, timers } = makeQueue();
    const release = jest.fn(() => Promise.resolve("sent"));

    const event = kill();
    const pending = queue.submitKill(event, release);

    expect(release).not.toHaveBeenCalled(); // held
    expect(timers.pending()).toBe(1); // deadline armed

    queue.recordEnrichment(enrichment({ victimRoles: ["Fighters"] }));

    await expect(pending).resolves.toBe("sent");
    expect(release).toHaveBeenCalledTimes(1);
    expect(timers.pending()).toBe(0); // deadline cancelled on release
    expect(event.metadata.weapon).toEqual({ weapon_class: "AAM", weapon_guidance: "RADAR_ACTIVE" });
  });

  it("releases without metadata when the deadline trips", async () => {
    const { queue, timers } = makeQueue();
    const release = jest.fn(() => Promise.resolve("sent"));

    const event = kill();
    const pending = queue.submitKill(event, release);
    expect(release).not.toHaveBeenCalled();

    timers.fireAll(); // deadline

    await expect(pending).resolves.toBe("sent");
    expect(release).toHaveBeenCalledTimes(1);
    expect(event).not.toHaveProperty("metadata");
  });

  it("sends immediately without waiting when mission scripting is disabled", async () => {
    const { queue, timers } = makeQueue({ missionScriptingEnabled: () => false });
    const release = jest.fn(() => Promise.resolve("sent"));

    const event = kill();
    await queue.submitKill(event, release);

    expect(release).toHaveBeenCalledTimes(1);
    expect(timers.pending()).toBe(0);
    expect(event).not.toHaveProperty("metadata");
  });

  it("sends immediately for a kill without a killer ucid", async () => {
    const { queue } = makeQueue();
    const release = jest.fn(() => Promise.resolve("sent"));

    await queue.submitKill({ type: "kill", weaponName: "AIM-9" }, release);

    expect(release).toHaveBeenCalledTimes(1);
  });

  it("sends immediately for an explicit non-AI kill whose ucid is momentarily unknown", async () => {
    // killerIsAi=false bypasses the AI fast path, but a blank ucid can never match
    // an enrichment (keyed by playerUcid) — so it must NOT be held for the deadline.
    // Regression guard: the killerIsAi flag previously skipped the short-circuit that
    // the AI fallback gave blank-ucid kills.
    const { queue, timers } = makeQueue();
    const release = jest.fn(() => Promise.resolve("sent"));

    const event = { type: "kill", killerIsAi: false, killerUcid: "", weaponName: "AIM-9" };
    await queue.submitKill(event, release);

    expect(release).toHaveBeenCalledTimes(1);
    expect(timers.pending()).toBe(0); // not held for the deadline
    expect(event).not.toHaveProperty("metadata");
  });

  it("does not reuse one enrichment for two kills", async () => {
    const { queue, timers } = makeQueue();
    const r1 = jest.fn(() => Promise.resolve("a"));
    const r2 = jest.fn(() => Promise.resolve("b"));

    queue.recordEnrichment(enrichment());
    await queue.submitKill(kill(), r1); // consumes it
    const second = queue.submitKill(kill(), r2); // must hold

    expect(r2).not.toHaveBeenCalled();
    expect(timers.pending()).toBe(1);
    timers.fireAll();
    await second;
    expect(r2).toHaveBeenCalledTimes(1);
  });

  it("matches the enrichment whose victim type matches the kill", async () => {
    const { queue } = makeQueue();

    queue.recordEnrichment(enrichment({ victimTypeName: "Su-27", weaponClass: "SAM" }));
    queue.recordEnrichment(enrichment({ victimTypeName: "MiG-29A", weaponClass: "AAM" }));

    const event = kill({ victimUnitType: "MiG-29A" });
    await queue.submitKill(event, () => Promise.resolve());

    expect(event.metadata.weapon.weapon_class).toBe("AAM");
  });

  it("matches a held kill to the enrichment by victim type", async () => {
    const { queue } = makeQueue();
    const su = kill({ victimUnitType: "Su-27" });
    const mig = kill({ victimUnitType: "MiG-29A" });

    const suPromise = queue.submitKill(su, () => Promise.resolve());
    const migPromise = queue.submitKill(mig, () => Promise.resolve());

    queue.recordEnrichment(enrichment({ victimTypeName: "MiG-29A", weaponGuidance: "IR" }));
    await migPromise;
    expect(mig.metadata.weapon.weapon_guidance).toBe("IR");

    queue.recordEnrichment(enrichment({ victimTypeName: "Su-27", weaponGuidance: "LASER" }));
    await suPromise;
    expect(su.metadata.weapon.weapon_guidance).toBe("LASER");
  });

  it("ignores non-enrichment events and enrichments without a killer ucid", async () => {
    const { queue, timers } = makeQueue();
    queue.recordEnrichment({ type: "kill", playerUcid: "killer-1" });
    queue.recordEnrichment(enrichment({ playerUcid: null }));

    const release = jest.fn(() => Promise.resolve());
    queue.submitKill(kill(), release);

    expect(release).not.toHaveBeenCalled(); // nothing was buffered, so it holds
    expect(timers.pending()).toBe(1);
  });

  it("expires buffered enrichments after the TTL so a later kill holds", async () => {
    let clock = 1000;
    const { queue, timers } = makeQueue({ enrichmentTtlMs: 5000, now: () => clock });

    queue.recordEnrichment(enrichment());
    clock += 6000; // past TTL

    const release = jest.fn(() => Promise.resolve());
    queue.submitKill(kill(), release);

    expect(release).not.toHaveBeenCalled();
    expect(timers.pending()).toBe(1);
  });

  it("keeps an enrichment that is still within the TTL", async () => {
    let clock = 1000;
    const { queue } = makeQueue({ enrichmentTtlMs: 5000, now: () => clock });

    queue.recordEnrichment(enrichment());
    clock += 4000; // within TTL

    const event = kill();
    await queue.submitKill(event, () => Promise.resolve());
    expect(event.metadata).toBeDefined();
  });

  it("does not double-release when an enrichment arrives after the deadline", async () => {
    const { queue, timers } = makeQueue();
    const release = jest.fn(() => Promise.resolve());

    const event = kill();
    const pending = queue.submitKill(event, release);
    timers.fireAll(); // deadline releases (no metadata)
    await pending;

    queue.recordEnrichment(enrichment()); // late — kill already gone

    expect(release).toHaveBeenCalledTimes(1);
    expect(event).not.toHaveProperty("metadata");
  });
});
