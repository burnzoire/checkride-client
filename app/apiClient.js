import log from 'electron-log'
import http from 'http'
import https from 'https'
import store from './config'

class APIClient {
  constructor() {
    this.use_ssl = store.get("use_ssl")
    this.http_module = this.use_ssl ? https : http
    this.host = store.get("server_host")
    this.port = store.get("server_port")
  }

  postEvent(payload, path) {
    return new Promise((resolve, reject) => {
      var options = {
        host: this.host,
        path: path,
        port: this.port,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': payload.length
        }
      }

      let req = this.http_module.request(options, (response) => {
        let body = []
        response.on('data', (chunk) => {
          body.push(chunk)
        })

        response.on('end', () => {
          if(response.statusCode != 201) {
            reject(response.body)
          }
          try {
            body = JSON.parse(Buffer.concat(body).toString())
          } catch (e) {
            reject(e)
          }
          resolve(body)
        })

        response.on('error', error => {
          reject(err)
        })
      })
      if (payload) {
        req.write(payload)
      }
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
            reject(e)
          }
          log.info(body.message)
          resolve(body)
        })

        response.on('error', error => {
          log.error(`couldn't ping the server at ${this.use_ssl ? "https" : "http"}://${options.host}${options.path} on port ${options.port}.`)
          reject(err)
        })
      })
      req.end()
    })
  }
}

export default APIClient
