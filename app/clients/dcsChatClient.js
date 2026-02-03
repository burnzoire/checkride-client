const dgram = require('dgram');
const log = require('electron-log');

const DEFAULT_DCS_CHAT_HOST = '127.0.0.1';

class DCSChatClient {
  constructor({ host = DEFAULT_DCS_CHAT_HOST, port } = {}) {
    this.host = host || DEFAULT_DCS_CHAT_HOST;
    this.port = Number.isFinite(Number(port)) ? Number(port) : undefined;
    this.socket = dgram.createSocket('udp4');
  }

  send(message, publish, { kind = 'achievement' } = {}) {
    if (!message) {
      log.info('DCS chat message missing, skipping DCS notification');
      return Promise.resolve();
    }

    if (publish === false) {
      log.info('DCS chat publish disabled, skipping DCS notification');
      return Promise.resolve();
    }

    const payload = JSON.stringify({
      message,
      kind,
      source: 'checkride',
    });

    return new Promise((resolve) => {
      this.socket.send(payload, this.port, this.host, (error) => {
        if (error) {
          log.error(`Error sending DCS chat message: ${error}`);
        } else {
          log.info(`Sent DCS chat message to ${this.host}:${this.port}`);
        }
        resolve();
      });
    });
  }
}

module.exports = {
  DCSChatClient,
  DEFAULT_DCS_CHAT_HOST,
};
