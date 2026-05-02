const log = require('electron-log');
const http = require('http');
const https = require('https');

class APIClientError extends Error {
  constructor(message) {
    super(message);
    this.name = 'APIClientError';
  }
}

class APISaveEventError extends APIClientError {
  constructor(message) {
    super(message);
    this.name = 'APISaveEventError';
  }
}

class APIClient {
  constructor(useSsl, host, port, apiToken = '', pathPrefix = '', clientVersion = null) {
    this.useSsl = useSsl
    this.httpModule = this.useSsl ? https : http
    this.host = host
    this.port = port
    this.apiToken = apiToken
    this.pathPrefix = pathPrefix
    this.clientVersion = clientVersion
  }

  update({ useSsl, host, port, apiToken, pathPrefix, clientVersion }) {
    this.useSsl = useSsl
    this.httpModule = this.useSsl ? https : http
    this.host = host
    this.port = port
    if (typeof apiToken !== 'undefined') {
      this.apiToken = apiToken
    }
    if (typeof pathPrefix !== 'undefined') {
      this.pathPrefix = pathPrefix
    }
    if (typeof clientVersion !== 'undefined') {
      this.clientVersion = clientVersion
    }
  }

  buildHeaders(additionalHeaders = {}) {
    const headers = { ...additionalHeaders }

    if (this.apiToken) {
      headers['Authorization'] = `Bearer ${this.apiToken}`
    }

    if (this.clientVersion) {
      headers['X-Checkride-Client-Version'] = this.clientVersion
    }

    return headers
  }

  saveEvent(payload) {
    return new Promise((resolve, reject) => {
      const data = JSON.stringify(payload);

      var options = {
        host: this.host,
        path: `${this.pathPrefix}/events`,
        port: this.port,
        method: 'POST',
        headers: this.buildHeaders({
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(data)
        })
      }

      const req = this.httpModule.request(options, (response) => {
        let body = []
        response.on('data', (chunk) => {
          body.push(chunk)
        })

        response.on('end', () => {
          if (response.statusCode !== 201) {
            reject(new APISaveEventError(`Failed to save event: ${Buffer.concat(body).toString()}`))
          }
          try {
            body = JSON.parse(Buffer.concat(body).toString())
          } catch (e) {
            reject(new APISaveEventError('Failed to parse API response'))
          }
          log.info("Event saved", body)
          resolve(body)
        })

        response.on('error', error => {
          reject(new APIClientError(`API request failed: ${error}`))
        })
      })

      req.on('error', (error) => {
        reject(new APIClientError(`API request failed: ${error}`));
      });

      req.write(data)
      req.end()
    })
  }

  saveAchievement({ playerUcid, achievementId, earnedAt }) {
    return new Promise((resolve, reject) => {
      const data = JSON.stringify({
        player_ucid: playerUcid,
        achievement_id: achievementId,
        earned_at: earnedAt,
      });

      const options = {
        host: this.host,
        path: `${this.pathPrefix}/pilot_achievements`,
        port: this.port,
        method: 'POST',
        headers: this.buildHeaders({
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(data),
        }),
      };

      const req = this.httpModule.request(options, (response) => {
        let body = [];
        response.on('data', (chunk) => { body.push(chunk); });
        response.on('end', () => {
          const statusCode = response.statusCode;
          const rawBody = Buffer.concat(body).toString();
          const isSuccess = statusCode === 200 || statusCode === 201;

          if (!isSuccess) {
            reject(new APIClientError(`Failed to save achievement: ${rawBody}`));
            return;
          }

          try {
            const parsed = JSON.parse(rawBody);
            const created = statusCode === 201;

            resolve({ ...parsed, created, statusCode });
          } catch (e) {
            reject(new APIClientError('Failed to parse save achievement response'));
          }
        });
        response.on('error', error => reject(new APIClientError(`API request failed: ${error}`)));
      });

      req.on('error', (error) => reject(new APIClientError(`API request failed: ${error}`)));
      req.write(data);
      req.end();
    });
  }

  fetchPilotAchievements(playerUcid) {
    return new Promise((resolve, reject) => {
      const options = {
        host: this.host,
        path: `${this.pathPrefix}/pilot_achievements?player_ucid=${encodeURIComponent(playerUcid)}`,
        port: this.port,
        method: 'GET',
        headers: this.buildHeaders(),
      };

      const req = this.httpModule.request(options, (response) => {
        let body = [];
        response.on('data', (chunk) => { body.push(chunk); });
        response.on('end', () => {
          if (response.statusCode !== 200) {
            reject(new APIClientError(`Failed to fetch pilot achievements: ${Buffer.concat(body).toString()}`));
            return;
          }
          try {
            resolve(JSON.parse(Buffer.concat(body).toString()));
          } catch (e) {
            reject(new APIClientError('Failed to parse fetch pilot achievements response'));
          }
        });
        response.on('error', error => reject(new APIClientError(`API request failed: ${error}`)));
      });

      req.on('error', (error) => reject(new APIClientError(`API request failed: ${error}`)));
      req.end();
    });
  }

  fetchPilotGauges(playerUcid) {
    return new Promise((resolve, reject) => {
      const options = {
        host: this.host,
        path: `${this.pathPrefix}/pilot_gauges?player_ucid=${encodeURIComponent(playerUcid)}`,
        port: this.port,
        method: 'GET',
        headers: this.buildHeaders(),
      };

      const req = this.httpModule.request(options, (response) => {
        let body = [];
        response.on('data', (chunk) => { body.push(chunk); });
        response.on('end', () => {
          if (response.statusCode !== 200) {
            reject(new APIClientError(`Failed to fetch pilot gauges: ${Buffer.concat(body).toString()}`));
            return;
          }
          try {
            resolve(JSON.parse(Buffer.concat(body).toString()));
          } catch (e) {
            reject(new APIClientError('Failed to parse fetch pilot gauges response'));
          }
        });
        response.on('error', error => reject(new APIClientError(`API request failed: ${error}`)));
      });

      req.on('error', (error) => reject(new APIClientError(`API request failed: ${error}`)));
      req.end();
    });
  }

  updatePilotGauge({ playerUcid, playerName, gaugeId, value, comparison = 'max' }) {
    return new Promise((resolve, reject) => {
      const data = JSON.stringify({
        player_ucid: playerUcid,
        player_name: playerName,
        value,
        comparison,
      });

      const options = {
        host: this.host,
        path: `${this.pathPrefix}/pilot_gauges/${encodeURIComponent(gaugeId)}`,
        port: this.port,
        method: 'PATCH',
        headers: this.buildHeaders({
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(data),
        }),
      };

      const req = this.httpModule.request(options, (response) => {
        let body = [];
        response.on('data', (chunk) => { body.push(chunk); });
        response.on('end', () => {
          const rawBody = Buffer.concat(body).toString();
          const ok = response.statusCode === 200;
          if (!ok) {
            reject(new APIClientError(`Failed to update pilot gauge: ${rawBody}`));
            return;
          }

          try {
            resolve(rawBody ? JSON.parse(rawBody) : {});
          } catch (e) {
            reject(new APIClientError('Failed to parse update pilot gauge response'));
          }
        });
        response.on('error', error => reject(new APIClientError(`API request failed: ${error}`)));
      });

      req.on('error', (error) => reject(new APIClientError(`API request failed: ${error}`)));
      req.write(data);
      req.end();
    });
  }

  publishPilotState(pilotStateUpdate) {
    return new Promise((resolve, reject) => {
      const data = JSON.stringify({ pilot_state_update: pilotStateUpdate });

      const options = {
        host: this.host,
        path: `${this.pathPrefix}/pilot_state_updates`,
        port: this.port,
        method: 'POST',
        headers: this.buildHeaders({
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(data),
        }),
      };

      const req = this.httpModule.request(options, (response) => {
        let body = [];
        response.on('data', (chunk) => { body.push(chunk); });
        response.on('end', () => {
          const rawBody = Buffer.concat(body).toString();
          const ok = response.statusCode === 202 || response.statusCode === 200;
          if (!ok) {
            reject(new APIClientError(`Failed to publish pilot state: ${rawBody}`));
            return;
          }

          try {
            resolve(rawBody ? JSON.parse(rawBody) : { ok: true });
          } catch (e) {
            resolve({ ok: true });
          }
        });
        response.on('error', error => reject(new APIClientError(`API request failed: ${error}`)));
      });

      req.on('error', (error) => reject(new APIClientError(`API request failed: ${error}`)));
      req.write(data);
      req.end();
    });
  }

  heartbeat() {
    return new Promise((resolve, reject) => {
      const options = {
        host: this.host,
        path: `${this.pathPrefix}/heartbeat`,
        port: this.port,
        method: 'POST',
        headers: this.buildHeaders({ 'Content-Length': 0 }),
      };

      const req = this.httpModule.request(options, (response) => {
        let body = [];
        response.on('data', (chunk) => { body.push(chunk); });
        response.on('end', () => {
          if (response.statusCode !== 200) {
            reject(new APIClientError(`Heartbeat failed with status ${response.statusCode}`));
            return;
          }
          resolve({ ok: true });
        });
        response.on('error', (error) => {
          reject(new APIClientError(`Heartbeat request failed: ${error}`));
        });
      });

      req.on('error', (error) => {
        reject(new APIClientError(`API request failed: ${error}`));
      });

      req.end();
    });
  }

  healthcheck() {
    return new Promise((resolve, reject) => {
      var options = {
        host: this.host,
        path: `${this.pathPrefix}/up`,
        port: this.port,
        method: 'GET',
        headers: this.buildHeaders()
      }
      const req = this.httpModule.request(options, (response) => {
        let body = []
        response.on('data', (chunk) => {
          body.push(chunk)
        })

        response.on('end', () => {
          if (response.statusCode !== 200) {
            reject(new APIClientError(`Healthcheck failed with status ${response.statusCode}`))
            return
          }
          resolve({ status: 'ok' })
        })

        response.on('error', error => {
          reject(new APIClientError(`Healthcheck request failed: ${error}`))
        })
      })

      req.on('error', (error) => {
        reject(new APIClientError(`API request failed: ${error}`));
      });

      req.end()
    })
  }
}

module.exports = {
  APIClient,
  APIClientError,
  APISaveEventError,
};
