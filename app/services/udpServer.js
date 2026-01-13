const dgram = require('dgram');
const log = require('electron-log');

class UDPServer {
  constructor(port) {
    this.port = Number(port)
    this.onEventCallback = null
    this.server = dgram.createSocket('udp4')
    this.start()
  }

  set onEvent(callback) {
    this.onEventCallback = callback;
  }

  start() {
    this.server.on('error', (err) => {
      log.error(`server error:\n${err.stack}`)
      this.server.close()
    })

    this.server.on('message', (msg, rinfo) => {
      log.info(`server got: ${msg} from ${rinfo.address}:${rinfo.port}`)
      const event = JSON.parse(msg.toString())

      if (this.onEventCallback) {

        this.onEventCallback(event)
          .catch(err => log.error(err))
      }
    })

    this.server.on('listening', () => {
      const address = this.server.address()
      log.info(`server listening ${address.address}:${address.port}`)
    })

    this.server.bind(this.port)
  }

  updatePort(port) {
    const nextPort = Number(port)

    if (!Number.isFinite(nextPort)) {
      throw new Error('Invalid UDP port provided')
    }

    if (nextPort === this.port) {
      return Promise.resolve()
    }

    this.port = nextPort

    return new Promise((resolve, reject) => {
      this.server.close((error) => {
        if (error) {
          reject(error)
          return
        }

        this.server = dgram.createSocket('udp4')
        this.start()
        resolve()
      })
    })
  }

  close() {
    this.server.close()
  }

  send(data) {
    if (!this.server) {
      log.error('Cannot send message: server is not started.')
      return
    }

    const address = this.server.address()
    const msg = JSON.stringify(data)
    this.server.send(msg, address.port, address.address)
  }


}

module.exports = UDPServer
