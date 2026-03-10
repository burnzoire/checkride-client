const WebSocket = require('ws');
const log = require('electron-log');

const CHANNEL_NAME = 'PilotStateIngestChannel';
const RECONNECT_DELAY_MS = 2000;
const MAX_QUEUE_SIZE = 50;

class PilotStatePublisher {
  constructor({ useSsl, host, port, token, pathPrefix = '' }) {
    this.useSsl = useSsl;
    this.host = host;
    this.port = port;
    this.token = token;
    this.pathPrefix = pathPrefix;

    this.socket = null;
    this.running = false;
    this.subscribed = false;
    this.reconnectTimer = null;
    this.queue = [];
    this.identifier = JSON.stringify({ channel: CHANNEL_NAME });
    this.hasLoggedConnectionFailure = false;
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.connect();
  }

  stop() {
    this.running = false;
    this.subscribed = false;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    if (this.socket) {
      try {
        this.socket.close();
      } catch (_error) {
      }
      this.socket = null;
    }
  }

  async publish(snapshot) {
    if (!snapshot || typeof snapshot !== 'object') {
      return;
    }

    if (!this.subscribed || !this.socket || this.socket.readyState !== WebSocket.OPEN) {
      this.enqueue(snapshot);
      return;
    }

    this.sendPublish(snapshot);
  }

  connect() {
    if (!this.running) return;

    const url = this.buildCableUrl();
    this.socket = new WebSocket(url);
    this.subscribed = false;

    this.socket.on('open', () => {
      this.sendFrame({
        command: 'subscribe',
        identifier: this.identifier,
      });
    });

    this.socket.on('message', (raw) => {
      this.handleMessage(raw);
    });

    this.socket.on('error', (error) => {
      this.handleConnectionError(error);
    });

    this.socket.on('close', () => {
      this.subscribed = false;
      this.socket = null;
      if (!this.running) return;

      this.reconnectTimer = setTimeout(() => {
        this.reconnectTimer = null;
        this.connect();
      }, RECONNECT_DELAY_MS);
    });
  }

  handleMessage(raw) {
    let message;
    try {
      message = JSON.parse(raw.toString());
    } catch (_error) {
      return;
    }

    if (message.type === 'confirm_subscription' && message.identifier === this.identifier) {
      if (this.hasLoggedConnectionFailure) {
        log.info('PilotStatePublisher websocket connected');
        this.hasLoggedConnectionFailure = false;
      }
      this.subscribed = true;
      this.flushQueue();
      return;
    }

    if (message.type === 'reject_subscription' && message.identifier === this.identifier) {
      log.error('PilotStatePublisher subscription rejected by ActionCable');
      this.subscribed = false;
    }
  }

  handleConnectionError(error) {
    if (this.hasLoggedConnectionFailure) {
      return;
    }

    this.hasLoggedConnectionFailure = true;
    const message = error?.code || error?.message || 'connection failed';
    log.warn(`PilotStatePublisher waiting for API websocket (${message})`);
  }

  flushQueue() {
    if (!this.subscribed || !this.socket || this.socket.readyState !== WebSocket.OPEN) {
      return;
    }

    while (this.queue.length > 0) {
      const snapshot = this.queue.shift();
      this.sendPublish(snapshot);
    }
  }

  enqueue(snapshot) {
    this.queue.push(snapshot);
    if (this.queue.length > MAX_QUEUE_SIZE) {
      this.queue = this.queue.slice(-MAX_QUEUE_SIZE);
    }
  }

  sendPublish(snapshot) {
    this.sendFrame({
      command: 'message',
      identifier: this.identifier,
      data: JSON.stringify({ action: 'publish', payload: snapshot }),
    });
  }

  sendFrame(frame) {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      return;
    }

    try {
      this.socket.send(JSON.stringify(frame));
    } catch (error) {
      log.error('PilotStatePublisher failed to send frame:', error);
    }
  }

  buildCableUrl() {
    const protocol = this.useSsl ? 'wss' : 'ws';
    const normalizedPrefix = this.pathPrefix && this.pathPrefix !== '/'
      ? this.pathPrefix.replace(/\/+$/, '')
      : '';
    const cablePath = `${normalizedPrefix}/cable`;
    const query = this.token ? `?token=${encodeURIComponent(this.token)}` : '';
    return `${protocol}://${this.host}:${this.port}${cablePath}${query}`;
  }
}

module.exports = PilotStatePublisher;