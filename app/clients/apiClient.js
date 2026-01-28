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
  constructor(useSsl, host, port, apiToken = '', pathPrefix = '') {
    this.useSsl = useSsl
    this.httpModule = this.useSsl ? https : http
    this.host = host
    this.port = port
    this.apiToken = apiToken
    this.pathPrefix = pathPrefix
  }

  update({ useSsl, host, port, apiToken, pathPrefix }) {
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
  }

  buildHeaders(additionalHeaders = {}) {
    const headers = { ...additionalHeaders }

    if (this.apiToken) {
      headers['Authorization'] = `Bearer ${this.apiToken}`
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
          if (response.statusCode < 200 || response.statusCode >= 300) {
            reject(new APIClientError(`Healthcheck failed with status ${response.statusCode}`))
          }
          const rawBody = Buffer.concat(body).toString()
          if (!rawBody) {
            resolve({ status: 'ok' })
            return
          }
          try {
            body = JSON.parse(rawBody)
            resolve(body)
          } catch (e) {
            resolve({ status: 'ok', raw: rawBody })
          }
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
