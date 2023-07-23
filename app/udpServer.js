import dgram from 'dgram'
import log from 'electron-log'
import EventFactory from './eventFactory'

class UDPServer {
  constructor(port, apiClient, discord) {
    this.port = port
    this.apiClient = apiClient
    this.discord = discord

    this.server = dgram.createSocket('udp4')
    this.start()
  }

  start() {
    this.server.on('error', (err) => {
      log.error(`server error:\n${err.stack}`)
      this.server.close()
    })

    this.server.on('message', (msg, rinfo) => {
      log.info(`server got: ${msg} from ${rinfo.address}:${rinfo.port}`)
      const eventData = JSON.parse(msg.toString())
    
      EventFactory.create(eventData)
        .then(gameEvent => this.apiClient.saveEvent(gameEvent))
        .then(response => this.discord.send(response.summary, response.publish))
        .catch(err => log.error(err))
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