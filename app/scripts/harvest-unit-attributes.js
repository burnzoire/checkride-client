#!/usr/bin/env node
/*
 * Harvests the DCS unit-role vocabulary OFFLINE from the install — no mission,
 * no DCS run. Units declare their roles as quoted strings inside
 * `attribute = { wsType_*, "Tanks", "Modern Tanks", ... }` blocks in readable
 * CoreMods/Mods Lua (e.g. HeavyMetalCore tanks, USS_Nimitz ships). This walks the
 * install, extracts those quoted strings, and diffs the vocabulary against the
 * role strings the client code currently assumes.
 *
 * It complements (and for most purposes replaces) the in-mission
 * probe_target_vocab.lua: the probe sees only what a mission spawned and reflects
 * the merged runtime set; this sees every Lua-declared unit but misses any unit
 * shipped only as a compiled/binary DB entry. Run both if you want belt + braces.
 *
 * Usage:  node app/scripts/harvest-unit-attributes.js ["D:\\DCS World"]
 *         npm run harvest:vocab -- "D:\\DCS World"     (from app/)
 *
 * Excluded from coverage (scripts/** ignored in jest collectCoverageFrom).
 */

const fs = require("fs");
const path = require("path");

// Keep in sync with the filters any role-based proficiency would rely on.
// Sourced from app/achievements/{tankKiller,doubleKill}.js + the mission Lua.
const ASSUMED_ROLES = {
  armour: ["Armour", "Tanks", "IFV", "APC"],
  sead: ["SAM", "SAM SR", "SAM TR", "SAM launcher", "AAA"],
  air: ["Fighters", "Multirole fighters", "Bombers", "Helicopters"],
};

// Heavy/irrelevant dirs that never hold unit role declarations — skipped so the
// walk stays fast over a large install.
const SKIP_DIRS = new Set([
  "Liveries", "Shaders", "Bazar", "Textures", "Fonts", "Sounds", "Movies",
  "Missions", "Music", "Mods.bak", ".git",
]);

function* walkLua(root) {
  let entries;
  try {
    entries = fs.readdirSync(root, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    const full = path.join(root, entry.name);
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      yield* walkLua(full);
    } else if (entry.isFile() && entry.name.toLowerCase().endsWith(".lua")) {
      yield full;
    }
  }
}

// A real DCS role attribute is a short clean phrase ("Tanks", "SAM SR",
// "Air Defence", "Multirole fighters"). Aircraft `attribute` fields can nest huge
// loadout/pylon tables, and a stray brace inside a string/comment can make the
// depth scan over-run — both inject junk. Accept only role-shaped tokens.
const ROLE_TOKEN = /^[A-Za-z][A-Za-z0-9 /&'’.()+-]{1,38}$/;
const ROLE_DENY = /loadout|station|pylon|CLSID|connector|\barg\b|forbidden|=|\{|\}/;
const MAX_BLOCK = 4000; // chars; blocks longer than this are treated as over-runs

function isRoleToken(s) {
  return ROLE_TOKEN.test(s) && !ROLE_DENY.test(s);
}

// Extract every `attribute = { ... }` block via brace-depth scan (handles
// multi-line and nested braces), then pull the role-shaped strings from each.
function extractAttributeStrings(text) {
  const strings = [];
  const marker = /attribute\s*=\s*\{/g;
  let m;
  while ((m = marker.exec(text)) !== null) {
    let depth = 1;
    let i = m.index + m[0].length;
    const start = i;
    for (; i < text.length && depth > 0 && i - start < MAX_BLOCK; i++) {
      const ch = text[i];
      if (ch === "{") depth++;
      else if (ch === "}") depth--;
    }
    if (depth !== 0) continue; // unbalanced within cap → likely over-run, skip
    const block = text.slice(start, i - 1);
    for (const sm of block.matchAll(/"([^"]+)"/g)) {
      if (isRoleToken(sm[1])) strings.push(sm[1]);
    }
  }
  return strings;
}

function main() {
  const root = process.argv[2] || "D:\\DCS World";
  if (!fs.existsSync(root)) {
    console.error(`DCS install not found: ${root}`);
    process.exit(1);
  }

  const vocab = new Map(); // attribute -> { count, files: Set }
  let filesScanned = 0;
  let filesWithAttrs = 0;

  for (const file of walkLua(root)) {
    filesScanned++;
    let text;
    try {
      text = fs.readFileSync(file, "utf8");
    } catch {
      continue;
    }
    if (!text.includes("attribute")) continue;
    const found = extractAttributeStrings(text);
    if (found.length === 0) continue;
    filesWithAttrs++;
    for (const attr of found) {
      if (!vocab.has(attr)) vocab.set(attr, { count: 0, files: new Set() });
      const e = vocab.get(attr);
      e.count += 1;
      e.files.add(path.basename(file));
    }
  }

  const observed = new Set(vocab.keys());
  const sorted = [...vocab.entries()].sort((a, b) => b[1].count - a[1].count);

  console.log(`# DCS unit-role vocabulary (offline harvest)`);
  console.log(`Scanned ${filesScanned} .lua files; ${filesWithAttrs} carried attribute blocks; ${vocab.size} distinct role strings.\n`);

  console.log("## Assumption diff (client filters vs. what the install declares)");
  for (const [group, assumed] of Object.entries(ASSUMED_ROLES)) {
    const confirmed = assumed.filter((a) => observed.has(a));
    const missing = assumed.filter((a) => !observed.has(a));
    console.log(`  [${group}]`);
    console.log(`    confirmed: ${confirmed.join(", ") || "(none)"}`);
    if (missing.length) {
      console.log(`    MISSING (assumed but never declared — typo / dead filter?): ${missing.join(", ")}`);
    }
  }

  console.log("\n## Full vocabulary (string  x<count>)");
  for (const [attr, e] of sorted) {
    console.log(`  ${attr}  x${e.count}`);
  }
}

main();
