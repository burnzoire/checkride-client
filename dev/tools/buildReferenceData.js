#!/usr/bin/env node
'use strict';

// Build a comprehensive DCS reference JSON from the live DCS scripting environment.
//
// Usage:
//   node dev/tools/buildReferenceData.js generate [--dcs-path "D:\DCS World"]
//     Scans DCS World Lua files for type-name candidates, generates the mission script,
//     and deploys both hook and mission script to Saved Games automatically.
//
//   node dev/tools/buildReferenceData.js process [path-to-json]
//     Reads the JSON written by the Lua script and writes dev/tools/dcs-reference-data.json.
//     Default input: <Saved Games>\DCS\checkride-enrichment.json

const fs   = require('fs');
const path = require('path');

const { scanDcsWorld, scanWeaponDescriptors } = require('./scanCandidates');

// ── Paths ─────────────────────────────────────────────────────────────────────
const SAVED_GAMES = path.join(
  process.env.USERPROFILE || 'C:\\Users\\Default',
  'Saved Games', 'DCS'
);

const TOOLS_DIR        = __dirname;
const MISSION_TEMPLATE = path.join(TOOLS_DIR, 'enricherMissionTemplate.lua');
const STATIC_HOOK      = path.join(TOOLS_DIR, 'DCS-CheckrideEnricher.lua');
const GENERATED        = path.join(TOOLS_DIR, 'checkride-enricher-mission.lua');
const OUTPUT_JSON      = path.join(TOOLS_DIR, '..', '..', 'app', 'data', 'dcs-reference-data.json');
const DCS_OUTPUT       = path.join(SAVED_GAMES, 'checkride-enrichment.json');
const DEPLOY_HOOK      = path.join(SAVED_GAMES, 'Scripts', 'Hooks', 'DCS-CheckrideEnricher.lua');
const DEPLOY_MISSION   = path.join(SAVED_GAMES, 'checkride-enricher-mission.lua');

// ── CLI ───────────────────────────────────────────────────────────────────────
const argv = process.argv.slice(2);
const command = argv.find(a => !a.startsWith('--')) ?? 'generate';
const dcsPathFlag = (() => {
  const i = argv.indexOf('--dcs-path');
  return i !== -1 ? argv[i + 1] : null;
})();

const DCS_WORLD = dcsPathFlag ?? process.env.DCS_WORLD_PATH ?? 'D:\\DCS World';

if (command === 'generate') {
  generate();
} else if (command === 'process') {
  const inputFile = argv.find(a => !a.startsWith('--') && a !== 'process') ?? DCS_OUTPUT;
  processOutput(inputFile);
} else {
  console.error(`Unknown command: ${command}`);
  console.error('Usage: node buildReferenceData.js [generate|process] [options]');
  process.exit(1);
}

// ── generate ──────────────────────────────────────────────────────────────────
function generate() {
  console.log(`DCS World path: ${DCS_WORLD}`);
  if (!fs.existsSync(DCS_WORLD)) {
    console.error(`Not found: ${DCS_WORLD}`);
    console.error('Set --dcs-path or the DCS_WORLD_PATH env variable.');
    process.exit(1);
  }

  const candidates = scanDcsWorld(DCS_WORLD);
  console.log(`Candidates: ${candidates.length}`);

  if (candidates.length === 0) {
    console.error('No candidates found — check DCS_WORLD_PATH.');
    process.exit(1);
  }

  const template = fs.readFileSync(MISSION_TEMPLATE, 'utf8');
  const lua = buildLua(template, candidates);
  fs.writeFileSync(GENERATED, lua, 'utf8');
  console.log(`Generated:  ${GENERATED}`);

  // Auto-deploy both files to Saved Games
  fs.mkdirSync(path.dirname(DEPLOY_HOOK), { recursive: true });
  fs.copyFileSync(STATIC_HOOK, DEPLOY_HOOK);
  fs.copyFileSync(GENERATED, DEPLOY_MISSION);
  console.log(`Deployed:   ${DEPLOY_HOOK}`);
  console.log(`Deployed:   ${DEPLOY_MISSION}`);

  console.log('\n── Next steps ────────────────────────────────────────────────');
  console.log('1. Stop the Checkride app (the hook replaces its callbacks).');
  console.log('2. Restart DCS and load any mission (needed for airdrome data).');
  console.log(`3. Output:   ${DCS_OUTPUT}`);
  console.log('4. Run:      node dev/tools/buildReferenceData.js process');
  console.log('5. Remove hook + mission files then restart DCS to restore normal operation.');
  console.log('──────────────────────────────────────────────────────────────');
}

function buildLua(template, candidates) {
  const candidatesList = candidates
    .map(n => `  ${JSON.stringify(n)}`)
    .join(',\n');

  return template
    .replace(/\{\{CANDIDATES\}\}/g, candidatesList)
    .replace(/\{\{CANDIDATE_COUNT\}\}/g, String(candidates.length));
}

// ── process ───────────────────────────────────────────────────────────────────
function processOutput(inputFile) {
  if (!fs.existsSync(inputFile)) {
    console.error(`Input not found: ${inputFile}`);
    console.error('Run DCS with the enricher hook first, then try again.');
    process.exit(1);
  }

  let raw;
  try {
    raw = JSON.parse(fs.readFileSync(inputFile, 'utf8'));
  } catch (e) {
    console.error(`Failed to parse ${inputFile}: ${e.message}`);
    process.exit(1);
  }

  // Weapons come from static file scanning — Weapon.getDescByName is unavailable in the MSE
  const scannedWeapons = scanWeaponDescriptors(DCS_WORLD);
  console.log(`Scanned weapons: ${scannedWeapons.length}`);

  // Units from DCS API; strip any STRUCTURE entries that are really weapon ammo types
  const weaponTypeNames = new Set(scannedWeapons.map(w => w.typeName));
  const apiUnits = (raw.units ?? []).filter(u => !weaponTypeNames.has(u.typeName));

  const out = {
    units:     apiUnits.map(normaliseUnit),
    weapons:   scannedWeapons.map(normaliseWeapon),
    airdromes: (raw.airdromes ?? []).map(normaliseAirdrome),
    meta:      raw.meta ?? {},
  };

  fs.writeFileSync(OUTPUT_JSON, JSON.stringify(out, null, 2), 'utf8');

  console.log(`Written: ${OUTPUT_JSON}`);
  console.log(`  units:     ${out.units.length}`);
  console.log(`  weapons:   ${out.weapons.length}`);
  console.log(`  airdromes: ${out.airdromes.length}`);
  if (out.meta.theater) {
    console.log(`  theater:   ${out.meta.theater}`);
  }
}

// ── Normalisation helpers ─────────────────────────────────────────────────────
function normaliseUnit(u) {
  return {
    typeName:    u.typeName,
    displayName: u.displayName ?? null,
    category:    u.category,
    attributes:  Array.isArray(u.attributes) ? u.attributes : [],
  };
}

function normaliseWeapon(w) {
  return {
    typeName:    w.typeName,
    displayName: w.displayName ?? null,
    category:    w.category,
    guidance:    w.guidance ?? 'NONE',
  };
}

function normaliseAirdrome(a) {
  return {
    name:     a.name,
    id:       a.id ?? null,
    category: a.category ?? 'AIRDROME',
    theater:  a.theater ?? null,
  };
}
