jest.mock('electron-log', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
}));

jest.mock('ws', () => {
  const instances = [];

  class MockWebSocket {
    constructor(url) {
      this.url = url;
      this.readyState = 0;
      this.handlers = {};
      this.send = jest.fn();
      this.close = jest.fn();
      instances.push(this);
    }

    on(event, handler) {
      this.handlers[event] = handler;
    }

    emit(event, payload) {
      if (this.handlers[event]) {
        this.handlers[event](payload);
      }
    }
  }

  MockWebSocket.OPEN = 1;
  MockWebSocket.__instances = instances;

  return MockWebSocket;
});

const WebSocket = require('ws');
const log = require('electron-log');
const PilotStatePublisher = require('./pilotStatePublisher');

describe('PilotStatePublisher', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    WebSocket.__instances.length = 0;
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('builds websocket URL with ssl, prefix, and encoded token', () => {
    const publisher = new PilotStatePublisher({
      useSsl: true,
      host: 'api.example.com',
      port: 443,
      token: 'abc 123',
      pathPrefix: '/api/v1/',
    });

    expect(publisher.buildCableUrl()).toBe('wss://api.example.com:443/api/v1/cable?token=abc%20123');
  });

  it('start is idempotent and only connects once when already running', () => {
    const publisher = new PilotStatePublisher({ useSsl: false, host: 'localhost', port: 3000 });
    const connectSpy = jest.spyOn(publisher, 'connect');

    publisher.start();
    publisher.start();

    expect(connectSpy).toHaveBeenCalledTimes(1);
    expect(WebSocket.__instances).toHaveLength(1);
  });

  it('queues snapshots while disconnected and caps queue size', async () => {
    const publisher = new PilotStatePublisher({ useSsl: false, host: 'localhost', port: 3000 });

    await publisher.publish(null);
    expect(publisher.queue).toHaveLength(0);

    for (let i = 0; i < 60; i += 1) {
      await publisher.publish({ n: i });
    }

    expect(publisher.queue).toHaveLength(50);
    expect(publisher.queue[0]).toEqual({ n: 10 });
    expect(publisher.queue[49]).toEqual({ n: 59 });
  });

  it('subscribes on open and flushes queued snapshots on confirm_subscription', async () => {
    const publisher = new PilotStatePublisher({ useSsl: false, host: 'localhost', port: 3000 });

    await publisher.publish({ speed: 500 });
    expect(publisher.queue).toHaveLength(1);

    publisher.start();
    const socket = WebSocket.__instances[0];
    socket.readyState = WebSocket.OPEN;

    socket.emit('open');

    expect(socket.send).toHaveBeenCalledWith(expect.stringContaining('"command":"subscribe"'));

    publisher.hasLoggedConnectionFailure = true;
    socket.emit('message', Buffer.from(JSON.stringify({
      type: 'confirm_subscription',
      identifier: publisher.identifier,
    })));

    expect(publisher.subscribed).toBe(true);
    expect(publisher.queue).toHaveLength(0);
    expect(socket.send).toHaveBeenCalledWith(expect.stringContaining('"command":"message"'));
    expect(log.info).toHaveBeenCalledWith('PilotStatePublisher websocket connected');
  });

  it('logs on rejected subscription', () => {
    const publisher = new PilotStatePublisher({ useSsl: false, host: 'localhost', port: 3000 });

    publisher.start();
    const socket = WebSocket.__instances[0];
    socket.emit('message', Buffer.from(JSON.stringify({
      type: 'reject_subscription',
      identifier: publisher.identifier,
    })));

    expect(log.error).toHaveBeenCalledWith('PilotStatePublisher subscription rejected by ActionCable');
    expect(publisher.subscribed).toBe(false);
  });

  it('ignores malformed websocket messages', () => {
    const publisher = new PilotStatePublisher({ useSsl: false, host: 'localhost', port: 3000 });

    publisher.start();
    const socket = WebSocket.__instances[0];
    socket.emit('message', Buffer.from('not-json'));

    expect(publisher.subscribed).toBe(false);
    expect(log.error).not.toHaveBeenCalled();
  });

  it('logs connection failure only once until recovery', () => {
    const publisher = new PilotStatePublisher({ useSsl: false, host: 'localhost', port: 3000 });

    publisher.handleConnectionError({ message: 'ECONNREFUSED' });
    publisher.handleConnectionError({ message: 'ECONNREFUSED' });

    expect(log.warn).toHaveBeenCalledTimes(1);
    expect(log.warn).toHaveBeenCalledWith('PilotStatePublisher waiting for API websocket (ECONNREFUSED)');
  });

  it('logs when sendFrame throws', () => {
    const publisher = new PilotStatePublisher({ useSsl: false, host: 'localhost', port: 3000 });
    const error = new Error('send failed');

    publisher.socket = {
      readyState: WebSocket.OPEN,
      send: jest.fn(() => {
        throw error;
      }),
    };

    publisher.sendFrame({ command: 'message' });

    expect(log.error).toHaveBeenCalledWith('PilotStatePublisher failed to send frame:', error);
  });

  it('reconnects after close when running', () => {
    jest.useFakeTimers();

    const publisher = new PilotStatePublisher({ useSsl: false, host: 'localhost', port: 3000 });
    const connectSpy = jest.spyOn(publisher, 'connect');

    publisher.start();
    const socket = WebSocket.__instances[0];
    socket.emit('close');

    expect(publisher.reconnectTimer).not.toBeNull();

    jest.advanceTimersByTime(2000);

    expect(connectSpy).toHaveBeenCalledTimes(2);
    expect(WebSocket.__instances.length).toBeGreaterThanOrEqual(2);
  });

  it('stop clears reconnect timer and closes socket', () => {
    jest.useFakeTimers();

    const publisher = new PilotStatePublisher({ useSsl: false, host: 'localhost', port: 3000 });
    publisher.start();

    const socket = WebSocket.__instances[0];
    publisher.reconnectTimer = setTimeout(() => {}, 2000);

    publisher.stop();

    expect(socket.close).toHaveBeenCalled();
    expect(publisher.running).toBe(false);
    expect(publisher.socket).toBeNull();
    expect(publisher.reconnectTimer).toBeNull();
  });
});
