const https = require('https');
const os = require('os');
const log = require('electron-log');

const LOG_API_HOSTNAME = 'log-api.newrelic.com';
const LOG_API_PATH = '/log/v1';
const BAKED_LICENSE_KEY = '__NEW_RELIC_LICENSE_KEY__';

class NewRelicClient {
  constructor(licenseKey) {
    const resolved = licenseKey || BAKED_LICENSE_KEY;
    this.licenseKey = resolved.startsWith('__') ? null : resolved;
    this.hostname = os.hostname();
    this.serverName = null;
  }

  setServerName(name) {
    this.serverName = name || null;
  }

  /**
   * Fire-and-forget structured log to New Relic Log API.
   * No-op when no license key is configured.
   */
  recordLog(message, attributes = {}) {
    if (!this.licenseKey) return;

    const body = JSON.stringify([{
      logs: [{
        timestamp: Date.now(),
        message,
        attributes: {
          service: 'checkride-client',
          dcsServerHostname: this.hostname,
          ...(this.serverName ? { dcsServerName: this.serverName } : {}),
          ...attributes,
        },
      }],
    }]);

    const req = https.request({
      hostname: LOG_API_HOSTNAME,
      path: LOG_API_PATH,
      method: 'POST',
      headers: {
        'Api-Key': this.licenseKey,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
      },
    }, (res) => {
      if (res.statusCode >= 400) {
        log.warn(`New Relic Log API responded with ${res.statusCode}`);
      }
      res.resume();
    });

    req.on('error', (err) => {
      log.warn('New Relic log submission failed:', err.message);
    });

    req.write(body);
    req.end();
  }
}

module.exports = { NewRelicClient };
