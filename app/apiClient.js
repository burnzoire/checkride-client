import log from 'electron-log'
import http from 'http'
import https from 'https'
import store from './config'

export class APIClientError extends Error {
  constructor(message) {
    super(message);
    this.name = 'APIClientError';
  }
}

export class APISaveEventError extends APIClientError {
  constructor(message) {
    super(message);
    this.name = 'APISaveEventError';
  }
}

export class APIPingError extends APIClientError {
  constructor(message) {
    super(message);
    this.name = 'APIPingError';
  }
}

class APIClient {
  constructor() {
    this.use_ssl = store.get("use_ssl")
    this.http_module = this.use_ssl ? https : http
    this.host = store.get("server_host")
    this.port = store.get("server_port")
  }

  saveEvent(payload) {
    return new Promise((resolve, reject) => {
      let data = JSON.stringify(payload); 
      
      var options = {
        host: this.host,
        path: '/events',
        port: this.port,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(data)
        }
      }

      let req = this.http_module.request(options, (response) => {
        let body = []
        response.on('data', (chunk) => {
          body.push(chunk)
        })

        response.on('end', () => {
          if(response.statusCode != 201) {
            reject(new APISaveEventError(`Failed to save event: ${Buffer.concat(body).toString()}`))
          }
          try {
            body = JSON.parse(Buffer.concat(body).toString())
          } catch (e) {
            reject(new APIClientError('Failed to parse API response'))
          }
          resolve(body)
        })

        response.on('error', error => {
          reject(new APIClientError(`API request failed: ${error}`))
        })
      })
      
      req.write(data)
      req.end()
    })
  }

  ping() {
    return new Promise((resolve, reject) => {
      var options = {
        host: this.host,
        path: '/ping',
        port: this.port,
        method: 'GET',
      }
      log.info(`pinging ${this.use_ssl ? "https" : "http"}://${options.host} on port ${options.port}`)
      let req = this.http_module.request(options, (response) => {
        let body = []
        response.on('data', (chunk) => {
          body.push(chunk)
        })

        response.on('end', () => {
          try {
            body = JSON.parse(Buffer.concat(body).toString())
          } catch (e) {
            reject(new APIPingError('Failed to parse API ping response'))
          }
          log.info(body.message)
          resolve(body)
        })

        response.on('error', error => {
          reject(new APIPingError(`Failed to ping API: ${error}`))
        })
      })
      req.end()
    })
  }
}

export default APIClient
