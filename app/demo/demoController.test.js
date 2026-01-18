jest.mock('dgram');
jest.mock('electron-log');

const dgram = require('dgram');
const log = require('electron-log');
const { DemoController } = require('./demoController');

describe('DemoController', () => {
  beforeEach(() => {
    jest.useFakeTimers();

    dgram.createSocket.mockImplementation(() => {
      return {
        bind: jest.fn(),
        send: jest.fn((_msg, _port, _host, cb) => cb && cb(null)),
        close: jest.fn()
      };
    });

    log.info = jest.fn();
    log.error = jest.fn();
  });

  afterEach(() => {
    jest.clearAllMocks();
    jest.useRealTimers();
  });

  it('starts and schedules work', () => {
    const controller = new DemoController({ seed: 'test-seed' });

    controller.start();

    expect(controller.isRunning).toBe(true);
    expect(dgram.createSocket).toHaveBeenCalledTimes(1);
    expect(jest.getTimerCount()).toBeGreaterThan(0);
  });

  it('stops and clears timers/sockets', () => {
    const controller = new DemoController({ seed: 'test-seed' });

    controller.start();
    controller.stop();

    expect(controller.isRunning).toBe(false);
    expect(jest.getTimerCount()).toBe(0);

    const sockets = dgram.createSocket.mock.results.map(r => r.value);
    sockets.forEach(socket => {
      expect(socket.close).toHaveBeenCalled();
    });
  });
});
