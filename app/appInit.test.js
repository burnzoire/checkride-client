jest.mock('./clients/apiClient');
jest.mock('./clients/discordClient');
jest.mock('./services/udpServer');
jest.mock('./factories/eventFactory');
jest.mock('./config');
jest.mock('electron-log');
jest.mock('./services/eventProcessor');

const { APIClient } = require('./clients/apiClient');
const { DiscordClient } = require('./clients/discordClient');
const UDPServer = require('./services/udpServer');
const { EventFactory } = require('./factories/eventFactory');
const store = require('./config');
const { initApp, attachEventPipeline } = require('./appInit');
const log = require('electron-log');
const { EventProcessor } = require('./services/eventProcessor');

describe('initApp', () => {
  let fakeUdpPort, fakeUseSsl, fakeApiHost, fakeApiPort, fakeApiToken, fakeDiscordWebhookPath, udpServerMock, processMock;

  beforeEach(() => {
    fakeUdpPort = 41234;
    fakeUseSsl = true;
    fakeApiHost = 'localhost';
    fakeApiPort = 8080;
    fakeApiToken = 'token-123';
    fakeDiscordWebhookPath = '/path/to/discord/webhook';

    udpServerMock = {
      onEvent: jest.fn()
    };

    UDPServer.mockImplementation(() => udpServerMock);

    processMock = jest.fn((_, payload) => payload);
    EventProcessor.mockImplementation(() => ({ process: processMock }));

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
        case 'api_token':
          return fakeApiToken;
        case 'discord_webhook_path':
          return fakeDiscordWebhookPath;
        default:
          return defaultValue;
      }
    });

    log.info = jest.fn();
    log.error = jest.fn();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('initializes application with correct configurations and sets up udp server', async () => {
    const { udpServer, apiClient, discordClient } = await initApp();

    expect(udpServer).toBe(udpServerMock);
    expect(apiClient).toBeInstanceOf(APIClient);
    expect(discordClient).toBeInstanceOf(DiscordClient);

    expect(UDPServer).toHaveBeenCalledWith(fakeUdpPort);
    expect(APIClient).toHaveBeenCalledWith(fakeUseSsl, fakeApiHost, fakeApiPort, fakeApiToken);
    expect(DiscordClient).toHaveBeenCalledWith(fakeDiscordWebhookPath);

    expect(udpServer.onEvent).toBeDefined();
  });

  it('calls saveEvent and send when an event occurs', async () => {
    const fakeEvent = { type: 'event' };
    const gameEvent = {
      prepare: jest.fn().mockReturnValue({ event: { event_type: 'event', event_data: { sample: true } } }),
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
    processMock.mockImplementation(() => ({ event: { event_type: 'event', event_data: { sample: true }, event_uid: 'uid' } }));

    APIClient.mockImplementation(() => apiClientMock);
    DiscordClient.mockImplementation(() => discordClientMock);
    EventFactory.create.mockResolvedValue(gameEvent);

    const { udpServer } = await initApp();

    await udpServer.onEvent(fakeEvent);

    expect(EventFactory.create).toHaveBeenCalledWith(fakeEvent);
    expect(gameEvent.prepare).toHaveBeenCalled();
    expect(processMock).toHaveBeenCalledWith(fakeEvent, { event: { event_type: 'event', event_data: { sample: true } } });
    expect(apiClientMock.saveEvent).toHaveBeenCalledWith({ event: { event_type: 'event', event_data: { sample: true }, event_uid: 'uid' } });
    expect(discordClientMock.send).toHaveBeenCalledWith(apiResponse.summary, apiResponse.publish);
  });


  it('logs error when an error occurs in the onEvent callback', async () => {
    const fakeEvent = { type: 'event' };

    EventFactory.create.mockRejectedValue(new Error('Test error'));

    const { udpServer } = await initApp();

    await udpServer.onEvent(fakeEvent);

    expect(log.error.mock.calls[0][0].message).toBe('Test error');
  });


  it('reattaches event pipeline when requested', async () => {
    const gameEvent = {
      prepare: jest.fn().mockReturnValue({ event: { event_type: 'event', event_data: {} } }),
    };
    const apiClientMock = {
      saveEvent: jest.fn().mockResolvedValue({ summary: 'summary', publish: true }),
    };
    const discordClientMock = {
      send: jest.fn().mockResolvedValue(),
    };
    const udpServer = {};

    processMock.mockImplementation((_, payload) => ({ ...payload, event: { ...payload.event, event_uid: 'uid' } }));

    EventFactory.create.mockResolvedValue(gameEvent);

    attachEventPipeline({ udpServer, apiClient: apiClientMock, discordClient: discordClientMock });

    await udpServer.onEvent({ type: 'event' });

    expect(EventFactory.create).toHaveBeenCalled();
    expect(apiClientMock.saveEvent).toHaveBeenCalledWith({ event: { event_type: 'event', event_data: {}, event_uid: 'uid' } });
    expect(discordClientMock.send).toHaveBeenCalledWith('summary', true);
  });


});
