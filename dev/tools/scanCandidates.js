'use strict';

const fs   = require('fs');
const path = require('path');
const zlib = require('zlib');

// ── File helpers ──────────────────────────────────────────────────────────────
function readFileSafe(filePath, maxBytes = 3 * 1024 * 1024) {
  try {
    const { size } = fs.statSync(filePath);
    if (size > maxBytes) return null;
    return fs.readFileSync(filePath, 'utf8');
  } catch {
    return null;
  }
}

function* walkFiles(dir, ext, depth = 0, maxDepth = 6) {
  if (depth > maxDepth) return;
  const SKIP = new Set(['Liveries', 'liveries', 'Textures', 'textures',
    'Sounds', 'sounds', 'Cockpit', 'cockpit', 'Shapes', 'shapes',
    'Bin', 'bin', 'node_modules', '.git', 'Doc', 'CefResources']);
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (!SKIP.has(e.name)) yield* walkFiles(full, ext, depth + 1, maxDepth);
    } else if (e.isFile() && e.name.endsWith(ext)) {
      yield full;
    }
  }
}

// ── Minimal ZIP reader (extracts named file from a .miz archive) ──────────────
function readFileFromZip(zipPath, targetName) {
  let buf;
  try { buf = fs.readFileSync(zipPath); } catch { return null; }
  if (buf.length < 22) return null;

  // Locate end-of-central-directory (EOCD) record (signature PK\x05\x06)
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65558); i--) {
    if (buf[i] === 0x50 && buf[i+1] === 0x4b && buf[i+2] === 0x05 && buf[i+3] === 0x06) {
      eocd = i; break;
    }
  }
  if (eocd === -1) return null;

  const cdCount  = buf.readUInt16LE(eocd + 10);
  const cdOffset = buf.readUInt32LE(eocd + 16);
  let pos = cdOffset;

  for (let i = 0; i < cdCount; i++) {
    if (pos + 46 > buf.length) break;
    if (buf[pos] !== 0x50 || buf[pos+1] !== 0x4b ||
        buf[pos+2] !== 0x01 || buf[pos+3] !== 0x02) break;

    const method   = buf.readUInt16LE(pos + 10);
    const cmpSize  = buf.readUInt32LE(pos + 20);
    const fnLen    = buf.readUInt16LE(pos + 28);
    const exLen    = buf.readUInt16LE(pos + 30);
    const cmtLen   = buf.readUInt16LE(pos + 32);
    const lhOff    = buf.readUInt32LE(pos + 42);
    const fname    = buf.toString('utf8', pos + 46, pos + 46 + fnLen);

    if (fname === targetName) {
      const lhFnLen  = buf.readUInt16LE(lhOff + 26);
      const lhExLen  = buf.readUInt16LE(lhOff + 28);
      const dataOff  = lhOff + 30 + lhFnLen + lhExLen;
      const cmpData  = buf.slice(dataOff, dataOff + cmpSize);
      try {
        const raw = method === 0 ? cmpData : zlib.inflateRawSync(cmpData);
        return raw.toString('utf8');
      } catch { return null; }
    }
    pos += 46 + fnLen + exLen + cmtLen;
  }
  return null;
}

// ── Candidate extraction ──────────────────────────────────────────────────────
function extractAll(text, re, out) {
  re.lastIndex = 0;
  let m;
  while ((m = re.exec(text)) !== null) {
    const v = m[1].trim();
    if (v.length >= 2 && v.length <= 100) out.add(v);
  }
}

// ── Scanning strategies ───────────────────────────────────────────────────────

// Aircraft: scan entry.lua in each mod folder for LogBook `type = "..."` fields
function scanAircraftEntries(modsDir, out) {
  if (!fs.existsSync(modsDir)) return 0;
  const RE = /\btype\s*=\s*"([^"\\]{2,80})"/g;
  let added = 0;
  for (const e of fs.readdirSync(modsDir, { withFileTypes: true })) {
    if (!e.isDirectory()) continue;
    const text = readFileSafe(path.join(modsDir, e.name, 'entry.lua'));
    if (!text) continue;
    const before = out.size;
    extractAll(text, RE, out);
    added += out.size - before;
  }
  return added;
}

// Ground / ship units: GT.Name = "..." in vehicle Lua files
function scanGroundUnits(dir, out) {
  if (!fs.existsSync(dir)) return 0;
  const RE = /GT\.Name\s*=\s*"([^"\\]{2,80})"/g;
  let added = 0;
  for (const file of walkFiles(dir, '.lua')) {
    const text = readFileSafe(file);
    if (!text) continue;
    const before = out.size;
    extractAll(text, RE, out);
    added += out.size - before;
  }
  return added;
}

// Weapons: scan AircraftWeaponPack / TechWeaponPack for:
//   name = "AIM_120C"           (weapon table name field)
//   ["GBU-12"] = {name = ...}   (common_bombs.lua style table key = typeName)
function scanWeaponPacks(dir, out) {
  if (!fs.existsSync(dir)) return 0;
  const NAME_RE = /\bname\s*=\s*"([^"\\]{2,80})"/g;
  const KEY_RE  = /\["([A-Z][^"\\]{1,80})"\]\s*=\s*\{name\s*=/g;
  let added = 0;
  for (const file of walkFiles(dir, '.lua')) {
    const text = readFileSafe(file);
    if (!text) continue;
    const before = out.size;
    extractAll(text, NAME_RE, out);
    extractAll(text, KEY_RE,  out);
    added += out.size - before;
  }
  return added;
}

// Mission files (.miz = ZIP): extract `["type"] = "..."` from the `mission` entry
// This is the most reliable source — it uses the exact DCS typeName strings.
function scanMissionFiles(dir, out, maxFiles = 30) {
  if (!fs.existsSync(dir)) return 0;
  const RE = /\["type"\]\s*=\s*"([^"\\]{2,80})"/g;
  let added = 0;
  let count = 0;
  for (const file of walkFiles(dir, '.miz')) {
    if (count++ >= maxFiles) break;
    const mission = readFileFromZip(file, 'mission');
    if (!mission) continue;
    const before = out.size;
    extractAll(mission, RE, out);
    added += out.size - before;
  }
  return added;
}

// ── Static weapon descriptor scanning ────────────────────────────────────────

// Map from AircraftWeaponPack filename stem → { category, guidance? }
// category uses the same strings as WEAPON_CATEGORY_NAMES / MISSILE_CATEGORY_NAMES in the enricher
const FILE_WEAPON_META = {
  // Air-to-air missiles
  aim120_family:              { category: 'AAM',        guidance: 'RADAR_ACTIVE' },
  aim7_family:                { category: 'AAM',        guidance: 'RADAR_SEMI_ACTIVE' },
  aim9_family:                { category: 'AAM',        guidance: 'IR' },
  Matra_A2A:                  { category: 'AAM',        guidance: 'IR' },
  R_60:                       { category: 'AAM',        guidance: 'IR' },
  R3_family:                  { category: 'AAM',        guidance: 'IR' },
  r27_family:                 { category: 'AAM' },   // mixed IR + radar variants
  // Anti-radiation
  'anti-radiation missiles':  { category: 'ARM',        guidance: 'RADAR_PASSIVE' },
  // Anti-ship
  AS_missiles:                { category: 'ANTI_SHIP',  guidance: 'RADAR_ACTIVE' },
  // Cruise / ballistic
  cruise_missiles:            { category: 'BM' },
  // Air-to-ground (mixed guidance — context scan will fill in)
  AGM_12:                     { category: 'OTHER' },
  agm65_family:               { category: 'OTHER' },
  kh25_29_family:             { category: 'OTHER' },
  HOT:                        { category: 'OTHER',      guidance: 'LASER' },
  Walleye:                    { category: 'OTHER',      guidance: 'TV' },
  // Bombs
  cluster_bombs:              { category: 'BOMB' },
  common_bombs:               { category: 'BOMB' },
  GBU_15:                     { category: 'BOMB',       guidance: 'TV' },
  glide_bombs:                { category: 'BOMB' },
  illumination_bombs:         { category: 'BOMB' },
  JDAM:                       { category: 'BOMB' },
  KABs:                       { category: 'BOMB' },
  MOAB:                       { category: 'BOMB' },
  paveway:                    { category: 'BOMB',       guidance: 'LASER' },
  // Rockets
  FFAR:                       { category: 'ROCKET' },
  rockets:                    { category: 'ROCKET' },
  // Ground weapon packs
  ammunition:                 { category: 'SHELL' },
  automaticgun:               { category: 'SHELL' },
  cannon:                     { category: 'SHELL' },
  ammunition_missiles:        { category: 'SAM' },
  manpads_missiles:           { category: 'SAM',        guidance: 'IR' },
  missile:                    { category: 'SAM' },
  tor_family:                 { category: 'SAM',        guidance: 'RADAR_ACTIVE' },
  tunguska_family:            { category: 'SAM' },
  ammunition_rockets:         { category: 'ROCKET' },
  torpedoes:                  { category: 'TORPEDO' },
};

// Head_Type field in DCS weapon Lua → guidance name
const HEAD_TYPE_GUIDANCE = { 1:'RADAR_ACTIVE', 2:'RADAR_SEMI_ACTIVE', 3:'RADAR_PASSIVE', 4:'LASER', 5:'TV', 6:'IR' };

function inferGuidanceFromContext(context) {
  // class_name string (most reliable)
  const cn = (context.match(/class_name\s*=\s*"([^"]+)"/) || [])[1] || '';
  if (/Laser/i.test(cn))      return 'LASER';
  if (/ActiveRadar/i.test(cn) || /RadarActive/i.test(cn)) return 'RADAR_ACTIVE';
  if (/SemiActive/i.test(cn)) return 'RADAR_SEMI_ACTIVE';
  if (/Passive/i.test(cn))    return 'RADAR_PASSIVE';
  if (/IR|Infra/i.test(cn))   return 'IR';
  if (/TV/i.test(cn))         return 'TV';

  // Head_Type numeric field
  const ht = (context.match(/\bHead_Type\s*=\s*(\d+)/) || [])[1];
  if (ht !== undefined) return HEAD_TYPE_GUIDANCE[Number(ht)] || 'NONE';

  return null; // unknown — caller uses file-level default
}

function scanWeaponDescriptors(dcsWorldPath) {
  const weaponDirs = [
    path.join(dcsWorldPath, 'CoreMods', 'aircraft', 'AircraftWeaponPack'),
    path.join(dcsWorldPath, 'CoreMods', 'tech', 'TechWeaponPack', 'Database', 'Weapons'),
  ];

  const NAME_RE = /\bname\s*=\s*"([^"\\]{2,80})"/g;
  const KEY_RE  = /\["([A-Z][^"\\]{1,80})"\]\s*=\s*\{/g;
  const seen    = new Set();
  const result  = [];

  for (const dir of weaponDirs) {
    if (!fs.existsSync(dir)) continue;

    for (const file of walkFiles(dir, '.lua')) {
      const stem = path.basename(file, '.lua');
      const fileMeta = FILE_WEAPON_META[stem];
      if (!fileMeta) continue; // skip non-weapon files (entry, definitions, pods, etc.)

      const text = readFileSafe(file);
      if (!text) continue;

      const addWeapon = (typeName, contextStart, contextEnd) => {
        if (typeName.length < 2 || typeName.length > 100) return;
        if (seen.has(typeName)) return;
        seen.add(typeName);

        const context = text.slice(
          Math.max(0, contextStart - 100),
          Math.min(text.length, contextEnd + 800)
        );

        // File-level guidance takes priority; context scan fills in where file doesn't specify
        const guidance = fileMeta.guidance ?? inferGuidanceFromContext(context) ?? 'NONE';

        result.push({
          typeName,
          displayName: null,
          category: fileMeta.category,
          guidance,
        });
      };

      NAME_RE.lastIndex = 0;
      let m;
      while ((m = NAME_RE.exec(text)) !== null) {
        addWeapon(m[1].trim(), m.index, m.index + m[0].length);
      }

      KEY_RE.lastIndex = 0;
      while ((m = KEY_RE.exec(text)) !== null) {
        addWeapon(m[1].trim(), m.index, m.index + m[0].length);
      }
    }
  }

  return result.sort((a, b) => a.typeName.localeCompare(b.typeName));
}

// ── Main export ───────────────────────────────────────────────────────────────
function scanDcsWorld(dcsWorldPath) {
  const candidates = new Set();

  const log = (label, n) => {
    if (n > 0) process.stdout.write(`  ${label}: +${n}\n`);
  };

  // Aircraft type names from entry.lua LogBook sections
  log('aircraft/Mods',     scanAircraftEntries(path.join(dcsWorldPath, 'Mods',     'aircraft'), candidates));
  log('aircraft/CoreMods', scanAircraftEntries(path.join(dcsWorldPath, 'CoreMods', 'aircraft'), candidates));

  // Ground / ship unit type names (GT.Name = "...")
  const groundDirs = ['CoreMods/tech', 'Mods/tech', 'CoreMods/WWII Units', 'Mods/WWII Units'];
  for (const rel of groundDirs) {
    log(`ground(${rel})`, scanGroundUnits(path.join(dcsWorldPath, ...rel.split('/')), candidates));
  }

  // Weapon type names from weapon packs
  const weaponDirs = [
    'CoreMods/aircraft/AircraftWeaponPack',
    'CoreMods/tech/TechWeaponPack',
  ];
  for (const rel of weaponDirs) {
    log(`weapons(${path.basename(rel)})`, scanWeaponPacks(path.join(dcsWorldPath, ...rel.split('/')), candidates));
  }

  // Mission files: most reliable source of actual DCS type names
  const missionDirs = [
    'Mods/aircraft',
    'CoreMods/aircraft',
  ];
  for (const rel of missionDirs) {
    log(`missions(${rel})`, scanMissionFiles(path.join(dcsWorldPath, ...rel.split('/')), candidates, 40));
  }

  // Filter noise: short lowercase words, pure numbers, known non-type strings
  const noise = new Set(['name', 'type', 'file', 'left', 'right', 'none',
    'text', 'info', 'true', 'false', 'null', 'color', 'Land', 'TakeOff', 'Turning Point']);

  const filtered = [...candidates].filter(v => {
    if (v.length < 2 || v.length > 100)       return false;
    if (/^\d+$/.test(v))                        return false;
    if (/^[a-z]{1,4}$/.test(v))                return false;
    if (v.includes('\n') || v.includes('\t'))   return false;
    if (noise.has(v))                           return false;
    return true;
  });

  process.stdout.write(`  Total raw: ${candidates.size} → after filter: ${filtered.length}\n`);
  return filtered.sort();
}

module.exports = { scanDcsWorld, scanWeaponDescriptors };
