#!/usr/bin/env node

'use strict';

const fs = require('fs');
const path = require('path');

const APP_DIR = path.resolve(__dirname, '..');
const TOKEN = '__NEW_RELIC_LICENSE_KEY__';
const TARGET = path.join(APP_DIR, 'clients', 'newRelicClient.js');

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

if (!licenseKey) {
  console.warn('prepare-newrelic-key: NEW_RELIC_LICENSE_KEY not set — New Relic logging will be disabled in this build.');
  process.exit(0);
}

const source = fs.readFileSync(TARGET, 'utf8');
if (!source.includes(TOKEN)) {
  console.log('prepare-newrelic-key: token already replaced, skipping.');
  process.exit(0);
}

fs.writeFileSync(TARGET, source.replaceAll(TOKEN, licenseKey), 'utf8');
console.log('prepare-newrelic-key: license key stamped into clients/newRelicClient.js');
