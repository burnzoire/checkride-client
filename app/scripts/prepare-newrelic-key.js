#!/usr/bin/env node

'use strict';

const fs = require('fs');
const path = require('path');

const APP_DIR = path.resolve(__dirname, '..');
const TOKEN = '__NEW_RELIC_LICENSE_KEY__';
const SOURCE = path.join(APP_DIR, 'clients', 'newRelicClient.js');
const OUTPUT = path.join(APP_DIR, 'build', 'clients-stamped', 'newRelicClient.js');

function readEnvFile(envPath) {
  if (!fs.existsSync(envPath)) return {};
  return fs.readFileSync(envPath, 'utf8')
    .split('\n')
    .reduce((acc, line) => {
      const match = line.match(/^([^#=]+)=(.*)$/);
      if (match) acc[match[1].trim()] = match[2].trim();
      return acc;
    }, {});
}

const envVars = readEnvFile(path.join(APP_DIR, '.env'));
const licenseKey = process.env.NEW_RELIC_LICENSE_KEY || envVars.NEW_RELIC_LICENSE_KEY;

fs.mkdirSync(path.dirname(OUTPUT), { recursive: true });

if (!licenseKey) {
  console.warn('prepare-newrelic-key: NEW_RELIC_LICENSE_KEY not set — New Relic logging will be disabled in this build.');
  fs.copyFileSync(SOURCE, OUTPUT);
  process.exit(0);
}

const source = fs.readFileSync(SOURCE, 'utf8');
fs.writeFileSync(OUTPUT, source.replaceAll(TOKEN, licenseKey), 'utf8');
console.log('prepare-newrelic-key: license key stamped into build/clients-stamped/newRelicClient.js');
