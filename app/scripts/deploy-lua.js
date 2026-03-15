#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFileSync } = require('child_process');

const APP_DIR = path.resolve(__dirname, '..');
const REPO_DIR = path.resolve(APP_DIR, '..');

const VERSIONED_LUA_ROOT = path.join(APP_DIR, 'build', 'lua-versioned');

const LUA_FILES = [
  {
    src: path.join(VERSIONED_LUA_ROOT, 'Scripts', 'Hooks', 'DCS-Checkride-hook.lua'),
    relDest: path.join('Scripts', 'Hooks', 'DCS-Checkride-hook.lua'),
  },
  {
    src: path.join(VERSIONED_LUA_ROOT, 'Mods', 'Services', 'DCS-Checkride', 'Scripts', 'DCS-CheckrideGameGUI.lua'),
    relDest: path.join('Mods', 'Services', 'DCS-Checkride', 'Scripts', 'DCS-CheckrideGameGUI.lua'),
  },
  {
    src: path.join(VERSIONED_LUA_ROOT, 'Mods', 'Services', 'DCS-Checkride', 'Scripts', 'DCS-CheckrideMission.lua'),
    relDest: path.join('Mods', 'Services', 'DCS-Checkride', 'Scripts', 'DCS-CheckrideMission.lua'),
  },
];

function prepareVersionedLuaArtifacts() {
  const prepareScript = path.join(APP_DIR, 'scripts', 'prepare-lua-version.js');
  execFileSync(process.execPath, [prepareScript], {
    cwd: APP_DIR,
    stdio: 'inherit',
  });
}

const KNOWN_SAVED_GAMES_DIRS = [
  'DCS.openbeta',
  'DCS.openbeta_server',
  'DCS',
  'DCS.server',
];

function parseArgs(argv) {
  const args = { target: null, all: false };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === '--all') {
      args.all = true;
      continue;
    }

    if (arg === '--target') {
      args.target = argv[index + 1] || null;
      index += 1;
      continue;
    }

    if (arg.startsWith('--target=')) {
      args.target = arg.slice('--target='.length);
      continue;
    }
  }

  return args;
}

function detectSavedGamesTargets() {
  const savedGamesDir = path.join(os.homedir(), 'Saved Games');

  if (!fs.existsSync(savedGamesDir)) {
    return [];
  }

  return KNOWN_SAVED_GAMES_DIRS
    .map((name) => path.join(savedGamesDir, name))
    .filter((dir) => fs.existsSync(dir));
}

function resolveTargets(args) {
  if (args.target) {
    return [path.resolve(args.target)];
  }

  const detected = detectSavedGamesTargets();
  if (detected.length === 0) {
    return [];
  }

  if (args.all) {
    return detected;
  }

  return [detected[0]];
}

function copyFileToTarget(targetRoot, file) {
  const destination = path.join(targetRoot, file.relDest);
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.copyFileSync(file.src, destination);
  return destination;
}

function main() {
  prepareVersionedLuaArtifacts();

  const args = parseArgs(process.argv.slice(2));
  const targets = resolveTargets(args);

  if (targets.length === 0) {
    console.error('No DCS Saved Games target found. Use --target "<path-to-Saved Games\\DCS...>".');
    process.exit(1);
  }

  LUA_FILES.forEach((file) => {
    if (!fs.existsSync(file.src)) {
      console.error(`Missing source file: ${file.src}`);
      process.exit(1);
    }
  });

  targets.forEach((targetRoot) => {
    console.log(`Deploying Lua files to: ${targetRoot}`);

    LUA_FILES.forEach((file) => {
      const destination = copyFileToTarget(targetRoot, file);
      console.log(`  copied ${path.relative(REPO_DIR, file.src)} -> ${destination}`);
    });
  });

  console.log('Lua deployment complete.');
}

main();
