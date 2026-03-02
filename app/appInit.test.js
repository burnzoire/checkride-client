jest.mock('./clients/apiClient');
jest.mock('./clients/discordClient');
jest.mock('./clients/dcsChatClient');
jest.mock('./services/udpServer');
jest.mock('./factories/eventFactory');
jest.mock('./config');
jest.mock('electron-log');
jest.mock('./services/eventProcessor');
jest.mock('./services/healthChecker');

const { APIClient } = require('./clients/apiClient');
const { DiscordClient } = require('./clients/discordClient');
const { DCSChatClient } = require('./clients/dcsChatClient');
const UDPServer = require('./services/udpServer');
const { EventFactory } = require('./factories/eventFactory');
const store = require('./config');
const { initApp, attachEventPipeline } = require('./appInit');
const log = require('electron-log');
const { EventProcessor } = require('./services/eventProcessor');
const { HealthChecker } = require('./services/healthChecker');

describe('initApp', () => {
  let fakeUseSsl, fakeApiHost, fakeApiPort, fakeApiToken, fakePathPrefix, fakeDiscordWebhookPath, udpServerMock, dcsChatClientMock, processMock;

  beforeEach(() => {
    fakeUseSsl = true;
    fakeApiHost = 'localhost';
    fakeApiPort = 8080;
    fakeApiToken = 'token-123';
    fakePathPrefix = '';
    fakeDiscordWebhookPath = '/path/to/discord/webhook';

    udpServerMock = {
      onEvent: jest.fn()
    };

    dcsChatClientMock = {
      send: jest.fn().mockResolvedValue(),
      sendConfig: jest.fn().mockResolvedValue(),
    };

    UDPServer.mockImplementation(() => udpServerMock);
    DCSChatClient.mockImplementation(() => dcsChatClientMock);

    processMock = jest.fn((_, payload) => payload);
    EventProcessor.mockImplementation(() => ({ process: processMock }));
    HealthChecker.mockImplementation(() => ({
      start: jest.fn(),
      setOnStatusChange: jest.fn(),
      checkHealth: jest.fn(),
      stop: jest.fn(),
    }));

    store.get.mockImplementation((key, defaultValue) => {
      switch (key) {
        case 'use_ssl':
          return fakeUseSsl;
        case 'server_host':
          return fakeApiHost;
        case 'server_port':
          return fakeApiPort;
        case 'api_token':
          return fakeApiToken;
        case 'path_prefix':
          return fakePathPrefix;
        case 'discord_webhook_path':
          return fakeDiscordWebhookPath;
        case 'mission_scripting_enabled':
          return true;
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
    const { udpServer, apiClient, discordClient, dcsChatClient } = await initApp();

    expect(udpServer).toBe(udpServerMock);
    expect(apiClient).toBeInstanceOf(APIClient);
    expect(discordClient).toBeInstanceOf(DiscordClient);
    expect(dcsChatClient).toBe(dcsChatClientMock);

    expect(UDPServer).toHaveBeenCalledWith(41234);
    expect(APIClient).toHaveBeenCalledWith(fakeUseSsl, fakeApiHost, fakeApiPort, fakeApiToken, fakePathPrefix);
    expect(DiscordClient).toHaveBeenCalledWith(fakeDiscordWebhookPath);
    expect(DCSChatClient).toHaveBeenCalled();
    expect(dcsChatClientMock.sendConfig).toHaveBeenCalledWith({ mission_scripting_enabled: true });

    expect(udpServer.onEvent).toBeDefined();
  });

  it('sends config when a ready event arrives from GameGUI', async () => {
    const { udpServer } = await initApp();

    dcsChatClientMock.sendConfig.mockClear();
    store.get.mockImplementation((key) => key === 'mission_scripting_enabled' ? false : undefined);

    await udpServer.onEvent({ type: 'ready' });

    expect(dcsChatClientMock.sendConfig).toHaveBeenCalledWith({ mission_scripting_enabled: false });
    expect(EventFactory.create).not.toHaveBeenCalledWith({ type: 'ready' });
  });

  it('logs state-only events when persist is false', async () => {
    const { udpServer } = await initApp();

    const event = {
      type: 'kill_enrichment',
      persist: false,
      playerName: 'Maverick',
      victimUnitCategory: 'air',
      isEnemy: true,
      carrierDistanceNm: 42.37,
    };

    await udpServer.onEvent(event);

    expect(log.info).toHaveBeenCalledWith(
      `State-only event (persist=false): ${JSON.stringify(event)}`
    );
  });


  it('calls saveEvent and send when an event occurs', async () => {
    const fakeEvent = { type: 'event' };
    const gameEvent = {
      prepare: jest.fn().mockReturnValue({ event: { event_type: 'event', event_data: { sample: true } } }),
    };
    const apiResponse = {
      summary: 'summary'
    };
    const apiClientMock = {
      saveEvent: jest.fn().mockResolvedValue(apiResponse),
    };
    const discordClientMock = {
      send: jest.fn().mockResolvedValue(),
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
    expect(discordClientMock.send).toHaveBeenCalledWith(apiResponse.summary, true);
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
    const dcsChatClientMock = {
      send: jest.fn().mockResolvedValue(),
    };
    const udpServer = {};

    processMock.mockImplementation((_, payload) => ({ ...payload, event: { ...payload.event, event_uid: 'uid' } }));

    EventFactory.create.mockResolvedValue(gameEvent);

    attachEventPipeline({ udpServer, apiClient: apiClientMock, discordClient: discordClientMock, dcsChatClient: dcsChatClientMock });

    await udpServer.onEvent({ type: 'event' });

    expect(EventFactory.create).toHaveBeenCalled();
    expect(apiClientMock.saveEvent).toHaveBeenCalledWith({ event: { event_type: 'event', event_data: {}, event_uid: 'uid' } });
    expect(discordClientMock.send).toHaveBeenCalledWith('summary', true);
  });

  it('sends achievement messages when achievements are present', async () => {
    const fakeEvent = { type: 'event' };
    const gameEvent = {
      prepare: jest.fn().mockReturnValue({ event: { event_type: 'event', event_data: { sample: true } } }),
    };
    const apiResponse = {
      summary: 'summary',
      achievements: [
        { message: 'Maverick achieved F-14 Sidewinder Basic Proficiency' },
        { message: 'Maverick achieved F-14 Sidewinder Advanced Proficiency' }
      ]
    };
    const apiClientMock = {
      saveEvent: jest.fn().mockResolvedValue(apiResponse),
    };
    const discordClientMock = {
      send: jest.fn().mockResolvedValue(),
    };
    const dcsChatClientMock = {
      send: jest.fn().mockResolvedValue(),
      sendConfig: jest.fn().mockResolvedValue(),
    };

    processMock.mockImplementation(() => ({ event: { event_type: 'event', event_data: { sample: true }, event_uid: 'uid' } }));

    APIClient.mockImplementation(() => apiClientMock);
    DiscordClient.mockImplementation(() => discordClientMock);
    DCSChatClient.mockImplementation(() => dcsChatClientMock);

    EventFactory.create.mockResolvedValue(gameEvent);

    const { udpServer } = await initApp();

    await udpServer.onEvent(fakeEvent);

    expect(discordClientMock.send).toHaveBeenCalledWith('summary', true);
    expect(discordClientMock.send).toHaveBeenCalledWith(':white_check_mark: Maverick achieved F-14 Sidewinder Basic Proficiency', true);
    expect(discordClientMock.send).toHaveBeenCalledWith(':white_check_mark: Maverick achieved F-14 Sidewinder Advanced Proficiency', true);
    expect(dcsChatClientMock.send).toHaveBeenCalledWith('Maverick achieved F-14 Sidewinder Basic Proficiency', true, { kind: 'achievement' });
    expect(dcsChatClientMock.send).toHaveBeenCalledWith('Maverick achieved F-14 Sidewinder Advanced Proficiency', true, { kind: 'achievement' });
  });

  it('does not send discord messages when summary is missing', async () => {
    const fakeEvent = { type: 'event' };
    const gameEvent = {
      prepare: jest.fn().mockReturnValue({ event: { event_type: 'event', event_data: { sample: true } } }),
    };
    const apiResponse = {
      achievements: [{ message: 'Achievement should not be sent' }]
    };
    const apiClientMock = {
      saveEvent: jest.fn().mockResolvedValue(apiResponse),
    };
    const discordClientMock = {
      send: jest.fn().mockResolvedValue(),
    };
    const dcsChatClientMock = {
      send: jest.fn().mockResolvedValue(),
      sendConfig: jest.fn().mockResolvedValue(),
    };

    processMock.mockImplementation(() => ({ event: { event_type: 'event', event_data: { sample: true }, event_uid: 'uid' } }));

    APIClient.mockImplementation(() => apiClientMock);
    DiscordClient.mockImplementation(() => discordClientMock);
    DCSChatClient.mockImplementation(() => dcsChatClientMock);

    EventFactory.create.mockResolvedValue(gameEvent);

    const { udpServer } = await initApp();

    await udpServer.onEvent(fakeEvent);

    expect(discordClientMock.send).not.toHaveBeenCalled();
    expect(dcsChatClientMock.send).not.toHaveBeenCalled();
  });

  it('logs errors when discord summary send fails', async () => {
    const fakeEvent = { type: 'event' };
    const gameEvent = {
      prepare: jest.fn().mockReturnValue({ event: { event_type: 'event', event_data: { sample: true } } }),
    };
    const apiResponse = {
      summary: 'summary'
    };
    const apiClientMock = {
      saveEvent: jest.fn().mockResolvedValue(apiResponse),
    };
    const discordError = new Error('discord failed');
    const discordClientMock = {
      send: jest.fn().mockRejectedValue(discordError),
    };

    processMock.mockImplementation(() => ({ event: { event_type: 'event', event_data: { sample: true }, event_uid: 'uid' } }));

    APIClient.mockImplementation(() => apiClientMock);
    DiscordClient.mockImplementation(() => discordClientMock);

    EventFactory.create.mockResolvedValue(gameEvent);

    const { udpServer } = await initApp();

    await udpServer.onEvent(fakeEvent);

    expect(log.error).toHaveBeenCalledWith('Error sending Discord summary:', discordError);
  });

  it('logs errors when discord achievement send fails', async () => {
    const fakeEvent = { type: 'event' };
    const gameEvent = {
      prepare: jest.fn().mockReturnValue({ event: { event_type: 'event', event_data: { sample: true } } }),
    };
    const apiResponse = {
      summary: 'summary',
      achievements: [{ message: 'Achievement message' }]
    };
    const apiClientMock = {
      saveEvent: jest.fn().mockResolvedValue(apiResponse),
    };
    const achievementError = new Error('achievement failed');
    const discordClientMock = {
      send: jest.fn()
        .mockResolvedValueOnce()
        .mockRejectedValueOnce(achievementError),
    };

    processMock.mockImplementation(() => ({ event: { event_type: 'event', event_data: { sample: true }, event_uid: 'uid' } }));

    APIClient.mockImplementation(() => apiClientMock);
    DiscordClient.mockImplementation(() => discordClientMock);

    EventFactory.create.mockResolvedValue(gameEvent);

    const { udpServer } = await initApp();

    await udpServer.onEvent(fakeEvent);

    expect(log.error).toHaveBeenCalledWith('Error sending Discord achievement #1:', achievementError);
  });

  it('sends DCS chat even when discord achievement send fails', async () => {
    const fakeEvent = { type: 'event' };
    const gameEvent = {
      prepare: jest.fn().mockReturnValue({ event: { event_type: 'event', event_data: { sample: true } } }),
    };
    const apiResponse = {
      summary: 'summary',
      achievements: [{ message: 'Achievement message' }]
    };
    const apiClientMock = {
      saveEvent: jest.fn().mockResolvedValue(apiResponse),
    };
    const achievementError = new Error('achievement failed');
    const discordClientMock = {
      send: jest.fn()
        .mockResolvedValueOnce()
        .mockRejectedValueOnce(achievementError),
    };
    const dcsChatClientMock = {
      send: jest.fn().mockResolvedValue(),
      sendConfig: jest.fn().mockResolvedValue(),
    };

    processMock.mockImplementation(() => ({ event: { event_type: 'event', event_data: { sample: true }, event_uid: 'uid' } }));

    APIClient.mockImplementation(() => apiClientMock);
    DiscordClient.mockImplementation(() => discordClientMock);
    DCSChatClient.mockImplementation(() => dcsChatClientMock);

    EventFactory.create.mockResolvedValue(gameEvent);

    const { udpServer } = await initApp();

    await udpServer.onEvent(fakeEvent);

    expect(dcsChatClientMock.send).toHaveBeenCalledWith('Achievement message', true, { kind: 'achievement' });
    expect(log.error).toHaveBeenCalledWith('Error sending Discord achievement #1:', achievementError);
  });

  it('calls saveAchievement when a client-side achievement unlocks', async () => {
    const fakeEvent = { type: 'grading', playerUcid: 'ucid-1', playerName: 'Maverick', lsoGrade: 'OK', wire: 3 };
    const gameEvent = {
      prepare: jest.fn().mockReturnValue({ event: { event_type: 'grading', event_data: {} } }),
    };
    const fakeAchievement = {
      id: 'carrier_qualified',
      message: jest.fn().mockReturnValue('Maverick is Carrier Qualified'),
    };
    const achievementEngineMock = {
      evaluate: jest.fn().mockReturnValue([fakeAchievement]),
      loadAchievementsFromApi: jest.fn().mockResolvedValue(),
      resetPilot: jest.fn(),
    };
    const apiClientMock = {
      saveEvent: jest.fn().mockResolvedValue({ summary: 'Trapped aboard', publish: true }),
      saveAchievement: jest.fn().mockResolvedValue({}),
      fetchPilotAchievements: jest.fn().mockResolvedValue({ achievement_ids: [] }),
    };
    const discordClientMock = { send: jest.fn().mockResolvedValue() };
    const dcsChatClientMock = { send: jest.fn().mockResolvedValue(), sendConfig: jest.fn().mockResolvedValue() };

    EventFactory.create.mockResolvedValue(gameEvent);

    const udpServer = {};
    attachEventPipeline({
      udpServer,
      apiClient: apiClientMock,
      discordClient: discordClientMock,
      dcsChatClient: dcsChatClientMock,
      achievementEngine: achievementEngineMock,
    });

    await udpServer.onEvent(fakeEvent);

    expect(apiClientMock.saveAchievement).toHaveBeenCalledWith(expect.objectContaining({
      playerUcid: 'ucid-1',
      achievementId: 'carrier_qualified',
      earnedAt: expect.any(String),
    }));
  });

  it('loads achievements from API on connect event', async () => {
    const connectEvent = { type: 'connect', playerUcid: 'ucid-1', playerName: 'Maverick' };
    const gameEvent = {
      prepare: jest.fn().mockReturnValue({ event: { event_type: 'connect', event_data: {} } }),
    };
    const achievementEngineMock = {
      evaluate: jest.fn().mockReturnValue([]),
      loadAchievementsFromApi: jest.fn().mockResolvedValue(),
      resetPilot: jest.fn(),
    };
    const apiClientMock = {
      saveEvent: jest.fn().mockResolvedValue({ publish: true }),
      saveAchievement: jest.fn().mockResolvedValue({}),
      fetchPilotAchievements: jest.fn().mockResolvedValue({ achievement_ids: [] }),
    };
    const discordClientMock = { send: jest.fn().mockResolvedValue() };
    const dcsChatClientMock = { send: jest.fn().mockResolvedValue(), sendConfig: jest.fn().mockResolvedValue() };

    EventFactory.create.mockResolvedValue(gameEvent);

    const udpServer = {};
    attachEventPipeline({
      udpServer,
      apiClient: apiClientMock,
      discordClient: discordClientMock,
      dcsChatClient: dcsChatClientMock,
      achievementEngine: achievementEngineMock,
    });

    await udpServer.onEvent(connectEvent);

    expect(achievementEngineMock.resetPilot).toHaveBeenCalledWith('ucid-1');
    expect(achievementEngineMock.loadAchievementsFromApi).toHaveBeenCalledWith('ucid-1', apiClientMock);
  });

});
