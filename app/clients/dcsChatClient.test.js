jest.mock('dgram', () => {
  const sockets = [];

  const createSocket = jest.fn(() => {
    const socket = {
      send: jest.fn(),
    };
    sockets.push(socket);
    return socket;
  });

  return {
    createSocket,
    __sockets: sockets,
  };
});

jest.mock('electron-log', () => ({
  info: jest.fn(),
  error: jest.fn(),
}));

const dgram = require('dgram');
const log = require('electron-log');
const { DCSChatClient, DEFAULT_DCS_CHAT_HOST } = require('./dcsChatClient');

describe('DCSChatClient', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    dgram.__sockets.length = 0;
  });

  it('uses default host and undefined port when port is invalid', () => {
    const client = new DCSChatClient({ host: '', port: 'invalid' });

    expect(client.host).toBe(DEFAULT_DCS_CHAT_HOST);
    expect(client.port).toBeUndefined();
    expect(dgram.createSocket).toHaveBeenCalledWith('udp4');
  });

  it('sendConfig sends config payload and resolves', async () => {
    const client = new DCSChatClient({ host: '127.0.0.1', port: 5002 });
    const socket = dgram.__sockets[0];

    socket.send.mockImplementation((payload, port, host, callback) => callback());

    await client.sendConfig({ enabled: true, channel: 'global' });

    expect(socket.send).toHaveBeenCalledWith(
      JSON.stringify({ source: 'checkride', kind: 'config', enabled: true, channel: 'global' }),
      5002,
      '127.0.0.1',
      expect.any(Function)
    );
  });

  it('sendConfig logs socket errors but still resolves', async () => {
    const client = new DCSChatClient({ port: 5002 });
    const socket = dgram.__sockets[0];
    const error = new Error('send failed');

    socket.send.mockImplementation((payload, port, host, callback) => callback(error));

    await expect(client.sendConfig({ enabled: false })).resolves.toBeUndefined();
    expect(log.error).toHaveBeenCalledWith(`Error sending DCS config: ${error}`);
  });

  it('skips send when message is missing', async () => {
    const client = new DCSChatClient({ port: 5002 });
    const socket = dgram.__sockets[0];

    await expect(client.send('', true)).resolves.toBeUndefined();

    expect(log.info).toHaveBeenCalledWith('DCS chat message missing, skipping DCS notification');
    expect(socket.send).not.toHaveBeenCalled();
  });

  it('skips send when publish flag is false', async () => {
    const client = new DCSChatClient({ port: 5002 });
    const socket = dgram.__sockets[0];

    await expect(client.send('fox three', false)).resolves.toBeUndefined();

    expect(log.info).toHaveBeenCalledWith('DCS chat publish disabled, skipping DCS notification');
    expect(socket.send).not.toHaveBeenCalled();
  });

  it('sends achievement payload and logs success', async () => {
    const client = new DCSChatClient({ host: '192.168.1.15', port: 5002 });
    const socket = dgram.__sockets[0];

    socket.send.mockImplementation((payload, port, host, callback) => callback());

    await expect(client.send('Splash one bandit', true)).resolves.toBeUndefined();

    const payload = JSON.parse(socket.send.mock.calls[0][0]);
    expect(payload).toEqual({
      message: 'Splash one bandit',
      kind: 'achievement',
      source: 'checkride',
    });
    expect(log.info).toHaveBeenCalledWith(`Sent DCS chat message to ${client.host}:${client.port}`);
  });

  it('logs error when socket send fails', async () => {
    const client = new DCSChatClient({ port: 5002 });
    const socket = dgram.__sockets[0];
    const error = new Error('udp send failure');

    socket.send.mockImplementation((payload, port, host, callback) => callback(error));

    await expect(client.send('message', true, { kind: 'alert' })).resolves.toBeUndefined();

    expect(log.error).toHaveBeenCalledWith(`Error sending DCS chat message: ${error}`);
  });
});
