jest.mock('dgram', () => {
  const sockets = [];
  const factory = () => {
    const socket = {
      on: jest.fn(),
      bind: jest.fn(),
      close: jest.fn((callback) => {
        if (typeof callback === 'function') {
          callback();
        }
      }),
      send: jest.fn(),
      address: jest.fn(() => ({ address: 'localhost', port: 41234 })),
    };
    sockets.push(socket);
    return socket;
  };

  const createSocket = jest.fn().mockImplementation(factory);

  return {
    createSocket,
    __sockets: sockets,
  };
});

jest.mock('electron-log', () => {
  return {
    error: jest.fn(),
    info: jest.fn(),
  };
});

const UDPServer = require('./udpServer');
const dgram = require('dgram');
const log = require('electron-log');

describe('UDPServer', () => {
  let udpServer;

  beforeEach(() => {
    jest.clearAllMocks();
    dgram.__sockets.length = 0;
    udpServer = new UDPServer(41234);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Constructor', () => {
    it('should create a server on construction', () => {
      expect(dgram.createSocket).toHaveBeenCalledWith('udp4');
      expect(udpServer.server.on).toHaveBeenCalledWith('error', expect.any(Function));
      expect(udpServer.server.on).toHaveBeenCalledWith('message', expect.any(Function));
      expect(udpServer.server.on).toHaveBeenCalledWith('listening', expect.any(Function));
      expect(udpServer.server.bind).toHaveBeenCalledWith(41234);
    });
  });

  describe('onEvent', () => {
    it('should call onEvent callback when a message is received', () => {
      const fakeEvent = { type: 'event' };
      const callback = jest.fn().mockResolvedValue();
      udpServer.onEvent = callback;

      const messageCallback = udpServer.server.on.mock.calls[1][1];
      const rinfoMock = { address: 'localhost', port: 41234 };
      messageCallback(Buffer.from(JSON.stringify(fakeEvent)), rinfoMock);

      expect(callback).toHaveBeenCalledWith(fakeEvent);
    });

    it('should log error when onEventCallback raises an error', async () => {
      const message = JSON.stringify({ type: 'errorEvent' });
      const rinfo = { address: 'localhost', port: 41234 };

      udpServer.onEventCallback = jest.fn(() => Promise.reject(new Error('Test error')));

      const messageCallback = udpServer.server.on.mock.calls[1][1];
      await messageCallback(Buffer.from(message), rinfo);

      expect(log.error).toHaveBeenCalledWith(new Error('Test error'));
    });

    it('should not call onEvent callback when it is not provided', () => {
      const fakeEvent = { type: 'event' };
      const callback = jest.fn().mockResolvedValue();
      const rinfoMock = { address: 'localhost', port: 41234 };

      udpServer.onEvent = null;  // setting callback to null
      const messageCallback = udpServer.server.on.mock.calls[1][1];

      expect(() => {
        messageCallback(Buffer.from(JSON.stringify(fakeEvent)), rinfoMock);  // Expect no error
      }).not.toThrow();

      expect(callback).not.toHaveBeenCalled();  // Callback function was not called
    });
  });

  describe('start', () => {
    it('should log server address and port when server is listening', () => {
      const address = { address: 'localhost', port: 41234 };
      udpServer.server.address.mockReturnValue(address);

      const listeningCallback = udpServer.server.on.mock.calls[2][1];
      listeningCallback();

      expect(log.info).toHaveBeenCalledWith(`server listening ${address.address}:${address.port}`);
    });

    it('should log error when an error event occurs', () => {
      const error = new Error('test error');
      const errorCallback = udpServer.server.on.mock.calls[0][1];
      errorCallback(error);

      expect(udpServer.server.close).toHaveBeenCalled();
    });
  });

  describe('close', () => {
    it('should close the server', () => {
      udpServer.close();
      expect(udpServer.server.close).toHaveBeenCalled();
    });
  });

  describe('send', () => {
    it('should send message', () => {
      const address = { address: 'localhost', port: 41234 };
      udpServer.server.address.mockReturnValue(address);
      const data = { type: 'event' };

      udpServer.send(data);

      expect(udpServer.server.send).toHaveBeenCalledWith(JSON.stringify(data), address.port, address.address);
    });

    it('should log error when server is not started', () => {
      udpServer.server = null;
      udpServer.send({ type: 'event' });
      expect(log.error).toHaveBeenCalledWith('Cannot send message: server is not started.');
    });
  });

  describe('updatePort', () => {
    it('rejects when provided port is invalid', async () => {
      expect(() => udpServer.updatePort('not-a-number')).toThrow('Invalid UDP port provided');
    });

    it('resolves without restarting when port is unchanged', async () => {
      const initialCalls = dgram.createSocket.mock.calls.length;
      await expect(udpServer.updatePort(41234)).resolves.toBeUndefined();
      expect(dgram.createSocket).toHaveBeenCalledTimes(initialCalls);
    });

    it('recreates socket when port changes', async () => {
      const firstSocket = dgram.__sockets[0];
      await udpServer.updatePort(50000);

      expect(firstSocket.close).toHaveBeenCalled();
      expect(dgram.createSocket).toHaveBeenCalledTimes(2);

      const newSocket = dgram.__sockets[1];
      expect(udpServer.server).toBe(newSocket);
      expect(newSocket.bind).toHaveBeenCalledWith(50000);
    });

    it('rejects when socket close returns an error', async () => {
      const failure = new Error('close failed');
      udpServer.server.close.mockImplementation((callback) => callback(failure));

      await expect(udpServer.updatePort(50001)).rejects.toThrow(failure);
    });
  });
});
