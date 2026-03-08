jest.mock('./clients/apiClient');
jest.mock('./clients/discordClient');
jest.mock('./clients/dcsChatClient');
jest.mock('./services/udpServer');
jest.mock('./factories/eventFactory');
jest.mock('./config');
jest.mock('electron-log');
jest.mock('./services/eventProcessor');
jest.mock('./services/healthChecker');
jest.mock('./services/pilotStatePublisher');

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
const PilotStatePublisher = require('./services/pilotStatePublisher');

describe('initApp', () => {
  let fakeUseSsl, fakeApiHost, fakeApiPort, fakeApiToken, fakePathPrefix, fakeDiscordWebhookPath, udpServerMock, dcsChatClientMock, processMock, pilotStatePublisherMock;

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

    pilotStatePublisherMock = {
      start: jest.fn(),
      stop: jest.fn(),
      publish: jest.fn().mockResolvedValue(),
    };
    PilotStatePublisher.mockImplementation(() => pilotStatePublisherMock);

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
    expect(APIClient).toHaveBeenCalledWith(fakeUseSsl, fakeApiHost, fakeApiPort, fakeApiToken, fakePathPrefix, expect.any(String));
    expect(DiscordClient).toHaveBeenCalledWith(fakeDiscordWebhookPath);
    expect(DCSChatClient).toHaveBeenCalled();
    expect(PilotStatePublisher).toHaveBeenCalledWith({
      useSsl: fakeUseSsl,
      host: fakeApiHost,
      port: fakeApiPort,
      token: fakeApiToken,
      pathPrefix: fakePathPrefix,
    });
    expect(pilotStatePublisherMock.start).toHaveBeenCalled();
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

  it('does not crash when ready arrives without a DCS chat client', async () => {
    const udpServer = {};
    const apiClientMock = { saveEvent: jest.fn(), saveAchievement: jest.fn() };
    const discordClientMock = { send: jest.fn().mockResolvedValue() };

    attachEventPipeline({
      udpServer,
      apiClient: apiClientMock,
      discordClient: discordClientMock,
    });

    await expect(udpServer.onEvent({ type: 'ready' })).resolves.toBeUndefined();
    expect(log.warn).toHaveBeenCalledWith('Skipping mission scripting config (ready): DCS chat client is unavailable');
  });

  it('does not crash startup when DCS chat client lacks sendConfig', async () => {
    DCSChatClient.mockImplementation(() => ({ send: jest.fn().mockResolvedValue() }));

    await expect(initApp()).resolves.toBeDefined();
    expect(log.warn).toHaveBeenCalledWith('Skipping mission scripting config (startup): DCS chat client is unavailable');
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

  it('does not log handling/state-only lines for flight sample enrichment', async () => {
    const apiClientMock = {
      saveAchievement: jest.fn().mockResolvedValue({ created: false }),
      fetchPilotAchievements: jest.fn().mockResolvedValue({ achievement_ids: [] }),
    };
    const pilotStatePublisher = { publish: jest.fn().mockResolvedValue() };

    const achievementEngineMock = {
      evaluate: jest.fn().mockReturnValue([]),
      loadAchievementsFromApi: jest.fn().mockResolvedValue(),
      resetPilot: jest.fn(),
      buildSnapshot: jest.fn().mockReturnValue({
        pilot_uid: 'pilot-1',
        state: { telemetry: { inAir: true }, state: {} },
      }),
    };

    const udpServer = {};
    attachEventPipeline({
      udpServer,
      apiClient: apiClientMock,
      discordClient: { send: jest.fn().mockResolvedValue() },
      dcsChatClient: { send: jest.fn().mockResolvedValue(), sendConfig: jest.fn().mockResolvedValue() },
      pilotStatePublisher,
      achievementEngine: achievementEngineMock,
      publishPilotStateUpdates: true,
    });

    const event = {
      type: 'flight_sample_enrichment',
      persist: false,
      playerUcid: 'pilot-1',
      playerName: 'Maverick',
    };

    await udpServer.onEvent(event);

    expect(log.info).not.toHaveBeenCalledWith(`Handling event: ${JSON.stringify(event)}`);
    expect(log.info).not.toHaveBeenCalledWith(`State-only event (persist=false): ${JSON.stringify(event)}`);
    expect(pilotStatePublisher.publish).toHaveBeenCalled();
  });

  it('logs published shot pilot state snapshot payload', async () => {
    const snapshot = {
      pilot_uid: 'pilot-1',
      trigger_event_type: 'shot_enrichment',
      state: { telemetry: { inAir: true }, state: { missiles: [] } },
    };

    const apiClientMock = {
      saveAchievement: jest.fn().mockResolvedValue({ created: false }),
      fetchPilotAchievements: jest.fn().mockResolvedValue({ achievement_ids: [] }),
    };
    const pilotStatePublisher = { publish: jest.fn().mockResolvedValue() };

    const achievementEngineMock = {
      evaluate: jest.fn().mockReturnValue([]),
      loadAchievementsFromApi: jest.fn().mockResolvedValue(),
      resetPilot: jest.fn(),
      buildSnapshot: jest.fn().mockReturnValue(snapshot),
    };

    const udpServer = {};
    attachEventPipeline({
      udpServer,
      apiClient: apiClientMock,
      discordClient: { send: jest.fn().mockResolvedValue() },
      dcsChatClient: { send: jest.fn().mockResolvedValue(), sendConfig: jest.fn().mockResolvedValue() },
      pilotStatePublisher,
      achievementEngine: achievementEngineMock,
      publishPilotStateUpdates: true,
    });

    await udpServer.onEvent({
      type: 'shot_enrichment',
      persist: false,
      playerUcid: 'pilot-1',
      playerName: 'Maverick',
    });

    expect(log.info).toHaveBeenCalledWith(`Publishing shot pilot state snapshot: ${JSON.stringify(snapshot)}`);
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

  it('skips processing when game event prepare returns null', async () => {
    const fakeEvent = { type: 'change_slot', playerUcid: '', playerName: '' };
    const gameEvent = {
      prepare: jest.fn().mockReturnValue(null),
    };
    const achievementEngineMock = {
      evaluate: jest.fn().mockReturnValue([]),
      loadAchievementsFromApi: jest.fn().mockResolvedValue(),
      resetPilot: jest.fn(),
    };
    const apiClientMock = {
      saveEvent: jest.fn().mockResolvedValue({ summary: 'should not happen' }),
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

    expect(achievementEngineMock.evaluate).toHaveBeenCalledWith(fakeEvent);
    expect(processMock).not.toHaveBeenCalled();
    expect(apiClientMock.saveEvent).not.toHaveBeenCalled();
    expect(discordClientMock.send).not.toHaveBeenCalled();
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

  it('ignores legacy achievements in event responses', async () => {
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
    expect(discordClientMock.send).toHaveBeenCalledTimes(1);
    expect(dcsChatClientMock.send).not.toHaveBeenCalled();
  });

  it('uses proficiencies and ignores mirrored achievements to avoid duplicate notifications', async () => {
    const fakeEvent = { type: 'event' };
    const gameEvent = {
      prepare: jest.fn().mockReturnValue({ event: { event_type: 'event', event_data: { sample: true } } }),
    };
    const sharedMessage = 'Maverick achieved F-14 Sidewinder Basic Proficiency';
    const apiResponse = {
      summary: 'summary',
      proficiencies: [{ message: sharedMessage }],
      achievements: [{ message: sharedMessage }],
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
    expect(discordClientMock.send).toHaveBeenCalledWith(`:white_check_mark: ${sharedMessage}`, true);
    expect(discordClientMock.send).toHaveBeenCalledTimes(2);
    expect(dcsChatClientMock.send).toHaveBeenCalledWith(sharedMessage, true, { kind: 'proficiency' });
    expect(dcsChatClientMock.send).toHaveBeenCalledTimes(1);
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

  it('logs errors when discord proficiency send fails', async () => {
    const fakeEvent = { type: 'event' };
    const gameEvent = {
      prepare: jest.fn().mockReturnValue({ event: { event_type: 'event', event_data: { sample: true } } }),
    };
    const apiResponse = {
      summary: 'summary',
      proficiencies: [{ message: 'Proficiency message' }]
    };
    const apiClientMock = {
      saveEvent: jest.fn().mockResolvedValue(apiResponse),
    };
    const proficiencyError = new Error('proficiency failed');
    const discordClientMock = {
      send: jest.fn()
        .mockResolvedValueOnce()
        .mockRejectedValueOnce(proficiencyError),
    };

    processMock.mockImplementation(() => ({ event: { event_type: 'event', event_data: { sample: true }, event_uid: 'uid' } }));

    APIClient.mockImplementation(() => apiClientMock);
    DiscordClient.mockImplementation(() => discordClientMock);

    EventFactory.create.mockResolvedValue(gameEvent);

    const { udpServer } = await initApp();

    await udpServer.onEvent(fakeEvent);

    expect(log.error).toHaveBeenCalledWith('Error sending Discord proficiency #1:', proficiencyError);
  });

  it('sends DCS chat even when discord proficiency send fails', async () => {
    const fakeEvent = { type: 'event' };
    const gameEvent = {
      prepare: jest.fn().mockReturnValue({ event: { event_type: 'event', event_data: { sample: true } } }),
    };
    const apiResponse = {
      summary: 'summary',
      proficiencies: [{ message: 'Proficiency message' }]
    };
    const apiClientMock = {
      saveEvent: jest.fn().mockResolvedValue(apiResponse),
    };
    const proficiencyError = new Error('proficiency failed');
    const discordClientMock = {
      send: jest.fn()
        .mockResolvedValueOnce()
        .mockRejectedValueOnce(proficiencyError),
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

    expect(dcsChatClientMock.send).toHaveBeenCalledWith('Proficiency message', true, { kind: 'proficiency' });
    expect(log.error).toHaveBeenCalledWith('Error sending Discord proficiency #1:', proficiencyError);
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

  it('does not send client-side achievement notifications when already recorded server-side', async () => {
    const fakeEvent = { type: 'grading', playerUcid: 'ucid-1', playerName: 'Maverick', lsoGrade: 'OK', wire: 3 };
    const gameEvent = {
      prepare: jest.fn().mockReturnValue({ event: { event_type: 'grading', event_data: {} } }),
    };
    const fakeAchievement = {
      id: 'three_wire',
      message: jest.fn().mockReturnValue('Maverick earned "Three Wire"'),
    };
    const achievementEngineMock = {
      evaluate: jest.fn().mockReturnValue([fakeAchievement]),
      loadAchievementsFromApi: jest.fn().mockResolvedValue(),
      resetPilot: jest.fn(),
    };
    const apiClientMock = {
      saveEvent: jest.fn().mockResolvedValue({ summary: 'Maverick (F-14B) was graded: _OK_ (3-wire)', publish: true }),
      saveAchievement: jest.fn().mockResolvedValue({ created: false, achievement_id: 'three_wire' }),
      fetchPilotAchievements: jest.fn().mockResolvedValue({ achievement_ids: ['three_wire'] }),
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
      achievementId: 'three_wire',
    }));
    expect(dcsChatClientMock.send).not.toHaveBeenCalledWith('Maverick earned "Three Wire"', true, { kind: 'achievement' });
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
