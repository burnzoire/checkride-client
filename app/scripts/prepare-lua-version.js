#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const APP_DIR = path.resolve(__dirname, '..');
const REPO_DIR = path.resolve(APP_DIR, '..');
const OUTPUT_ROOT = path.join(APP_DIR, 'build', 'lua-versioned');

const TOKEN = '__CHECKRIDE_CLIENT_VERSION__';

const LUA_FILES = [
  {
    src: path.join(REPO_DIR, 'Scripts', 'Hooks', 'DCS-Checkride-hook.lua'),
    outputRel: path.join('Scripts', 'Hooks', 'DCS-Checkride-hook.lua'),
  },
  {
    src: path.join(REPO_DIR, 'DCS-Checkride', 'Scripts', 'DCS-CheckrideGameGUI.lua'),
    outputRel: path.join('Mods', 'Services', 'DCS-Checkride', 'Scripts', 'DCS-CheckrideGameGUI.lua'),
  },
  {
    src: path.join(REPO_DIR, 'DCS-Checkride', 'Scripts', 'DCS-CheckrideMission.lua'),
    outputRel: path.join('Mods', 'Services', 'DCS-Checkride', 'Scripts', 'DCS-CheckrideMission.lua'),
  },
];

function getClientVersion(packageJsonPath = path.join(APP_DIR, 'package.json')) {
  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
  if (!packageJson.version || typeof packageJson.version !== 'string') {
    throw new Error(`Missing valid version in ${packageJsonPath}`);
  }
  return packageJson.version;
}

function stampLua(version, options = {}) {
  const token = options.token || TOKEN;
  const luaFiles = options.luaFiles || LUA_FILES;
  const outputRoot = options.outputRoot || OUTPUT_ROOT;
  const sourceRoot = options.sourceRoot || REPO_DIR;

  luaFiles.forEach((file) => {
    if (!fs.existsSync(file.src)) {
      throw new Error(`Missing source file: ${file.src}`);
    }

    const original = fs.readFileSync(file.src, 'utf8');
    if (!original.includes(token)) {
      throw new Error(`Version token not found in ${file.src}`);
    }

    const stamped = original.split(token).join(version);
    const outputPath = path.join(outputRoot, file.outputRel);

    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, stamped, 'utf8');
    console.log(`Stamped Lua ${path.relative(sourceRoot, file.src)} -> ${outputPath}`);
  });
}

function main() {
  const version = getClientVersion();
  stampLua(version);
  console.log(`Lua scripts stamped with client version ${version}`);
}

if (require.main === module) {
  main();
}

module.exports = {
  getClientVersion,
  stampLua,
  main,
};
