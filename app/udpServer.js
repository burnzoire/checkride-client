import dgram from 'dgram'
import log from 'electron-log'
import handleEvent from './event'
import store from './config'

export default class UDPServer {
  constructor() {
    this.server = dgram.createSocket('udp4');
    this.start();
  }

  start() {
    this.server.on('error', (err) => {
      log.error(`server error:\n${err.stack}`);
      this.server.close();
    });

    this.server.on('message', (msg, rinfo) => {
      log.info(`server got: ${msg} from ${rinfo.address}:${rinfo.port}`);
      handleEvent(msg);
    });

    this.server.on('listening', () => {
      const address = this.server.address();
      log.info(`server listening ${address.address}:${address.port}`);
    });

    const udp_port = store.get('udp_port', 41234);
    this.server.bind(udp_port);
  }

  close() {
    this.server.close();
  }

  send(msg) {
    const address = this.server.address()
    this.server.send(msg, address.port, address.address)
  }
}