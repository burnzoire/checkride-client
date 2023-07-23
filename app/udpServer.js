import dgram from 'dgram'
import log from 'electron-log'

class UDPServer {
  constructor(port) {
    this.port = port
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

export default UDPServer