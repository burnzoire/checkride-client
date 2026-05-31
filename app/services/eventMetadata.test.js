const buildEventMetadata = require("./eventMetadata");

describe("buildEventMetadata", () => {
  it("returns null for non-object input", () => {
    expect(buildEventMetadata(null)).toBeNull();
    expect(buildEventMetadata(undefined)).toBeNull();
    expect(buildEventMetadata("nope")).toBeNull();
    expect(buildEventMetadata(42)).toBeNull();
  });

  it("returns null when the event carries no DCS metadata", () => {
    expect(buildEventMetadata({ type: "connect" })).toBeNull();
    expect(buildEventMetadata({ type: "kill", metadata: null })).toBeNull();
    expect(buildEventMetadata({ type: "kill", metadata: {} })).toBeNull();
    expect(buildEventMetadata({ type: "kill", killerUnitAttributes: [] })).toBeNull();
  });

  it("folds GameGUI killer/victim attribute lists into a nested-by-actor object", () => {
    const event = {
      type: "kill",
      killerUcid: "abc",
      killerUnitType: "FA-18C_hornet",
      killerUnitAttributes: ["Air", "Planes", "Multirole fighters"],
      victimUnitType: "MiG-29A",
      victimUnitAttributes: ["Air", "Planes", "Fighters"],
      weaponName: "AIM-120C",
    };

    expect(buildEventMetadata(event)).toEqual({
      killer: { attributes: ["Air", "Planes", "Multirole fighters"] },
      victim: { attributes: ["Air", "Planes", "Fighters"] },
    });
  });

  it("folds the self unit attribute list for takeoff/landing-style events", () => {
    const event = {
      type: "landing",
      unitType: "F-16C_50",
      unitAttributes: ["Air", "Planes", "Battle airplanes"],
    };

    expect(buildEventMetadata(event)).toEqual({
      unit: { attributes: ["Air", "Planes", "Battle airplanes"] },
    });
  });

  it("passes a Lua-provided nested metadata object through", () => {
    const event = {
      type: "shot",
      metadata: {
        unit: { unit_type: "A-10C_2", domain: "air", role: "cas", category: "jet" },
        weapon: { weapon_name: "AGM-65D", weapon_category: "MISSILE", weapon_guidance: "TV" },
      },
    };

    expect(buildEventMetadata(event)).toEqual({
      unit: { unit_type: "A-10C_2", domain: "air", role: "cas", category: "jet" },
      weapon: { weapon_name: "AGM-65D", weapon_category: "MISSILE", weapon_guidance: "TV" },
    });
  });

  it("merges Lua-provided actor metadata with the GameGUI attribute list", () => {
    const event = {
      type: "kill",
      killerUnitAttributes: ["Air", "Planes"],
      metadata: {
        killer: { unit_type: "FA-18C_hornet", domain: "air" },
        weapon: { weapon_guidance: "RADAR_ACTIVE" },
      },
    };

    expect(buildEventMetadata(event)).toEqual({
      killer: { unit_type: "FA-18C_hornet", domain: "air", attributes: ["Air", "Planes"] },
      weapon: { weapon_guidance: "RADAR_ACTIVE" },
    });
  });

  it("ignores a non-array attribute value and a non-object metadata value", () => {
    expect(buildEventMetadata({ type: "kill", killerUnitAttributes: "x" })).toBeNull();
    expect(buildEventMetadata({ type: "kill", metadata: [1, 2] })).toBeNull();
  });

  it("does not mutate the source event or its Lua metadata", () => {
    const event = {
      type: "kill",
      killerUnitAttributes: ["Air"],
      metadata: { killer: { domain: "air" } },
    };
    const snapshot = JSON.stringify(event);

    buildEventMetadata(event);

    expect(JSON.stringify(event)).toBe(snapshot);
  });
});
