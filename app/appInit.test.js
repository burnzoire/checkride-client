const { APIClient } = require('./clients/apiClient');
const { DiscordClient } = require('./clients/discordClient');
const UDPServer = require('./services/udpServer');
const { EventFactory } = require('./factories/eventFactory');
const store = require('./config');
const { initApp } = require('./appInit');
const log = require('electron-log');

jest.mock('./clients/apiClient');
jest.mock('./clients/discordClient');
jest.mock('./services/udpServer');
jest.mock('./factories/eventFactory');
jest.mock('./config');
jest.mock('electron-log');

describe('initApp', () => {
  let fakeUdpPort, fakeUseSsl, fakeApiHost, fakeApiPort, fakeDiscordWebhookPath, udpServerMock;

  beforeEach(() => {
    fakeUdpPort = 41234;
    fakeUseSsl = true;
    fakeApiHost = 'localhost';
    fakeApiPort = 8080;
    fakeDiscordWebhookPath = '/path/to/discord/webhook';

    udpServerMock = {
      onEvent: jest.fn()
    };

    UDPServer.mockImplementation(() => udpServerMock);

    store.get.mockImplementation((key, defaultValue) => {
      switch (key) {
        case 'udp_port':
          return fakeUdpPort;
        case 'use_ssl':
          return fakeUseSsl;
        case 'server_host':
          return fakeApiHost;
        case 'server_port':
          return fakeApiPort;
        case 'discord_webhook_path':
          return fakeDiscordWebhookPath;
        default:
          return defaultValue;
      }
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('initializes application with correct configurations and sets up udp server', async () => {
    const { udpServer, apiClient } = await initApp();

    expect(udpServer).toBe(udpServerMock);
    expect(apiClient).toBeInstanceOf(APIClient);

    expect(UDPServer).toHaveBeenCalledWith(fakeUdpPort);
    expect(APIClient).toHaveBeenCalledWith(fakeUseSsl, fakeApiHost, fakeApiPort);
    expect(DiscordClient).toHaveBeenCalledWith(fakeDiscordWebhookPath);

    expect(udpServer.onEvent).toBeDefined();
  });

  it('calls saveEvent and send when an event occurs', async () => {
    const fakeEvent = { type: 'event' };
    const gameEvent = {
      prepare: jest.fn().mockReturnValue('prepared event'),
    };
    const apiResponse = {
      summary: 'summary',
      publish: true,
    };
    const apiClientMock = {
      saveEvent: jest.fn().mockResolvedValue(apiResponse),
    };
    const discordClientMock = {
      send: jest.fn(),
    };


    APIClient.mockImplementation(() => apiClientMock);
    DiscordClient.mockImplementation(() => discordClientMock);
    EventFactory.create.mockResolvedValue(gameEvent);

    const { udpServer } = await initApp();

    await udpServer.onEvent(fakeEvent);

    expect(EventFactory.create).toHaveBeenCalledWith(fakeEvent);
    expect(gameEvent.prepare).toHaveBeenCalled();
    expect(apiClientMock.saveEvent).toHaveBeenCalledWith('prepared event');
    expect(discordClientMock.send).toHaveBeenCalledWith(apiResponse.summary, apiResponse.publish);
  });


  it('logs error when an error occurs in the onEvent callback', async () => {
    const fakeEvent = { type: 'event' };

    EventFactory.create.mockRejectedValue(new Error('Test error'));

    const { udpServer } = await initApp();

    await udpServer.onEvent(fakeEvent);

    expect(log.error.mock.calls[0][0].message).toBe('Test error');
  });


});
