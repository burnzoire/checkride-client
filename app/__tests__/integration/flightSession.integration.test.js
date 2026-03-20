const { attachEventPipeline } = require('../../appInit');

describe('Flight session integration', () => {
  let apiClientMock;
  let discordClientMock;
  let udpServer;
  let savedPayloads;

  beforeEach(() => {
    savedPayloads = [];

    jest.useRealTimers();

    apiClientMock = {
      saveEvent: jest.fn((payload) => {
        savedPayloads.push(payload);
        return Promise.resolve({ summary: 'ok', publish: true });
      }),
      fetchPilotAchievements: jest.fn().mockResolvedValue({ achievement_ids: [] }),
    };

    discordClientMock = {
      send: jest.fn().mockResolvedValue()
    };

    udpServer = {};

    attachEventPipeline({ udpServer, apiClient: apiClientMock, discordClient: discordClientMock });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('does not include flight_uid in emitted payloads', async () => {
    const changeSlotEvent = {
      type: 'change_slot',
      playerUcid: 'pilot-1',
      playerName: 'Pilot 1',
      slotId: 'slot-1',
      prevSide: null,
      flyable: true
    };

    const takeoffEvent = {
      type: 'takeoff',
      playerUcid: 'pilot-1',
      playerName: 'Pilot 1',
      unitType: 'F-16',
      airdromeName: 'Base A'
    };

    const landingEvent = {
      type: 'landing',
      playerUcid: 'pilot-1',
      playerName: 'Pilot 1',
      unitType: 'F-16',
      airdromeName: 'Base A'
    };

    const postLandingTakeoffEvent = {
      type: 'takeoff',
      playerUcid: 'pilot-1',
      playerName: 'Pilot 1',
      unitType: 'F-16',
      airdromeName: 'Base A'
    };

    const secondChangeSlotEvent = {
      type: 'change_slot',
      playerUcid: 'pilot-1',
      playerName: 'Pilot 1',
      slotId: 'slot-2',
      prevSide: 1,
      flyable: true
    };

    const postSlotChangeTakeoffEvent = {
      type: 'takeoff',
      playerUcid: 'pilot-1',
      playerName: 'Pilot 1',
      unitType: 'AH-64',
      airdromeName: 'Base B'
    };

    const crashEvent = {
      type: 'crash',
      playerUcid: 'pilot-1',
      playerName: 'Pilot 1',
      unitType: 'F-16'
    };

    const postCrashTakeoffEvent = {
      type: 'takeoff',
      playerUcid: 'pilot-1',
      playerName: 'Pilot 1',
      unitType: 'F-16',
      airdromeName: 'Base A'
    };

    await udpServer.onEvent(changeSlotEvent);
    await udpServer.onEvent(takeoffEvent);
    await udpServer.onEvent(landingEvent);
    await udpServer.onEvent(postLandingTakeoffEvent);
    await udpServer.onEvent(secondChangeSlotEvent);
    await udpServer.onEvent(postSlotChangeTakeoffEvent);
    await udpServer.onEvent(crashEvent);
    await udpServer.onEvent(postCrashTakeoffEvent);

    expect(savedPayloads).toHaveLength(8);

    savedPayloads.forEach((payload) => {
      expect(payload.event.event_data.flight_uid).toBeUndefined();
      expect(payload.event.event_data.killer_flight_uid).toBeUndefined();
      expect(payload.event.event_data.victim_flight_uid).toBeUndefined();
    });
  });

  it('adds duration_seconds to landing events client-side', async () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-01-21T00:00:00.000Z'));

    const changeSlotEvent = {
      type: 'change_slot',
      playerUcid: 'pilot-99',
      playerName: 'Pilot 99',
      slotId: 'slot-99',
      prevSide: null,
      flyable: true
    };

    const takeoffEvent = {
      type: 'takeoff',
      playerUcid: 'pilot-99',
      playerName: 'Pilot 99',
      unitType: 'F-16',
      airdromeName: 'Base A'
    };

    const landingEvent = {
      type: 'landing',
      playerUcid: 'pilot-99',
      playerName: 'Pilot 99',
      unitType: 'F-16',
      airdromeName: 'Base A'
    };

    await udpServer.onEvent(changeSlotEvent);
    await udpServer.onEvent(takeoffEvent);

    jest.advanceTimersByTime(65_000);

    await udpServer.onEvent(landingEvent);

    expect(savedPayloads).toHaveLength(3);
    expect(savedPayloads[2].event.event_type).toBe('landing');
    expect(savedPayloads[2].event.event_data.duration_seconds).toBe(65);
  });

  it('clears airborne state on crash so landing does not get duration_seconds', async () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-01-21T00:00:00.000Z'));

    const changeSlotEvent = {
      type: 'change_slot',
      playerUcid: 'pilot-100',
      playerName: 'Pilot 100',
      slotId: 'slot-100',
      prevSide: null,
      flyable: true
    };

    const takeoffEvent = {
      type: 'takeoff',
      playerUcid: 'pilot-100',
      playerName: 'Pilot 100',
      unitType: 'F-16',
      airdromeName: 'Base A'
    };

    const crashEvent = {
      type: 'crash',
      playerUcid: 'pilot-100',
      playerName: 'Pilot 100',
      unitType: 'F-16'
    };

    const landingEvent = {
      type: 'landing',
      playerUcid: 'pilot-100',
      playerName: 'Pilot 100',
      unitType: 'F-16',
      airdromeName: 'Base A'
    };

    await udpServer.onEvent(changeSlotEvent);
    await udpServer.onEvent(takeoffEvent);
    await udpServer.onEvent(crashEvent);

    jest.advanceTimersByTime(65_000);

    await udpServer.onEvent(landingEvent);

    expect(savedPayloads).toHaveLength(4);
    expect(savedPayloads[3].event.event_type).toBe('landing');
    expect(savedPayloads[3].event.event_data.duration_seconds).toBeUndefined();
  });

  it('continues emitting payloads after pipeline reinitialization', async () => {
    const changeSlotEvent = {
      type: 'change_slot',
      playerUcid: 'pilot-42',
      playerName: 'Pilot 42',
      slotId: 'slot-42',
      prevSide: null,
      flyable: true
    };

    const takeoffEvent = {
      type: 'takeoff',
      playerUcid: 'pilot-42',
      playerName: 'Pilot 42',
      unitType: 'F-16',
      airdromeName: 'Base A'
    };

    const landingEvent = {
      type: 'landing',
      playerUcid: 'pilot-42',
      playerName: 'Pilot 42',
      unitType: 'F-16',
      airdromeName: 'Base A'
    };

    await udpServer.onEvent(changeSlotEvent);
    await udpServer.onEvent(takeoffEvent);

    attachEventPipeline({ udpServer, apiClient: apiClientMock, discordClient: discordClientMock });

    await udpServer.onEvent(landingEvent);

    expect(savedPayloads).toHaveLength(3);

    expect(savedPayloads[2].event.event_data.flight_uid).toBeUndefined();
  });

  it('does not include flight_uid for connect or slot events', async () => {
    const connectEvent = {
      type: 'connect',
      playerUcid: 'pilot-7',
      playerName: 'Pilot 7'
    };

    const spectatorSlotEvent = {
      type: 'change_slot',
      playerUcid: 'pilot-7',
      playerName: 'Pilot 7',
      slotId: 'spectators',
      prevSide: null,
      flyable: false
    };

    const flyableSlotEvent = {
      type: 'change_slot',
      playerUcid: 'pilot-7',
      playerName: 'Pilot 7',
      slotId: 'slot-10',
      prevSide: 1,
      flyable: true
    };

    const takeoffEvent = {
      type: 'takeoff',
      playerUcid: 'pilot-7',
      playerName: 'Pilot 7',
      unitType: 'F-16',
      airdromeName: 'Base A'
    };

    await udpServer.onEvent(connectEvent);
    await udpServer.onEvent(spectatorSlotEvent);
    await udpServer.onEvent(flyableSlotEvent);
    await udpServer.onEvent(takeoffEvent);

    expect(savedPayloads).toHaveLength(4);

    savedPayloads.forEach((payload) => {
      expect(payload.event.event_data.flight_uid).toBeUndefined();
    });
  });

  it('publishes the formatted summary returned by the API', async () => {
    apiClientMock.saveEvent.mockResolvedValueOnce({
      summary: 'Pilot 1 (F-16) took off',
      publish: true,
      proficiencies: [
        { message: 'Pilot 1 achieved F-16 Gun Basic Proficiency' }
      ]
    });

    const takeoffEvent = {
      type: 'takeoff',
      playerUcid: 'pilot-1',
      playerName: 'Pilot 1',
      unitType: 'F-16',
      airdromeName: 'Base A'
    };

    await udpServer.onEvent(takeoffEvent);

    expect(discordClientMock.send).toHaveBeenCalledWith('Pilot 1 (F-16) took off', true);
    expect(discordClientMock.send).toHaveBeenCalledWith(':white_check_mark: Pilot 1 achieved F-16 Gun Basic Proficiency', true);
  });

  it('maps UCID from takeoff identity for subsequent simulation frames', async () => {
    const pilotStatePublisherMock = {
      publish: jest.fn().mockResolvedValue(),
    };

    attachEventPipeline({
      udpServer,
      apiClient: apiClientMock,
      discordClient: discordClientMock,
      dcsChatClient: { send: jest.fn().mockResolvedValue(), sendConfig: jest.fn().mockResolvedValue() },
      pilotStatePublisher: pilotStatePublisherMock,
      publishPilotStateUpdates: true,
    });

    await udpServer.onEvent({
      type: 'takeoff',
      playerUcid: 'pilot-22',
      playerName: 'Pilot 22',
      unitType: 'F-16',
      airdromeName: 'Base A',
    });

    await udpServer.onEvent({
      type: 'flight_sample_enrichment',
      persist: false,
      playerName: 'Pilot 22',
      speedMach: 0.92,
      altitudeFt: 14250,
      inAir: true,
    });

    expect(pilotStatePublisherMock.publish).toHaveBeenCalledTimes(2);

    const takeoffSnapshot = pilotStatePublisherMock.publish.mock.calls[0][0];
    expect(takeoffSnapshot.pilot_uid).toBe('pilot-22');
    expect(takeoffSnapshot.pilot_name).toBe('Pilot 22');
    expect(takeoffSnapshot.trigger_event_type).toBe('takeoff');

    const flightFrameSnapshot = pilotStatePublisherMock.publish.mock.calls[1][0];
    expect(flightFrameSnapshot.pilot_uid).toBe('pilot-22');
    expect(flightFrameSnapshot.pilot_name).toBe('Pilot 22');
    expect(flightFrameSnapshot.trigger_event_type).toBe('flight_sample_enrichment');
    expect(flightFrameSnapshot.state.telemetry.speedMach).toBeCloseTo(0.92);
    expect(flightFrameSnapshot.state.telemetry.altBaroFt).toBeCloseTo(14250);
  });

  it('maps UCID from change_slot identity for subsequent simulation frames', async () => {
    const pilotStatePublisherMock = {
      publish: jest.fn().mockResolvedValue(),
    };

    attachEventPipeline({
      udpServer,
      apiClient: apiClientMock,
      discordClient: discordClientMock,
      dcsChatClient: { send: jest.fn().mockResolvedValue(), sendConfig: jest.fn().mockResolvedValue() },
      pilotStatePublisher: pilotStatePublisherMock,
      publishPilotStateUpdates: true,
    });

    await udpServer.onEvent({
      type: 'change_slot',
      playerUcid: 'pilot-33',
      playerName: 'Pilot 33',
      slotId: 'slot-33',
      prevSide: null,
      flyable: true,
    });

    await udpServer.onEvent({
      type: 'flight_sample_enrichment',
      persist: false,
      playerName: 'Pilot 33',
      speedMach: 0.88,
      altitudeFt: 9800,
      inAir: true,
    });

    expect(pilotStatePublisherMock.publish).toHaveBeenCalledTimes(2);

    const slotSnapshot = pilotStatePublisherMock.publish.mock.calls[0][0];
    expect(slotSnapshot.pilot_uid).toBe('pilot-33');
    expect(slotSnapshot.pilot_name).toBe('Pilot 33');
    expect(slotSnapshot.trigger_event_type).toBe('change_slot');

    const flightFrameSnapshot = pilotStatePublisherMock.publish.mock.calls[1][0];
    expect(flightFrameSnapshot.pilot_uid).toBe('pilot-33');
    expect(flightFrameSnapshot.pilot_name).toBe('Pilot 33');
    expect(flightFrameSnapshot.trigger_event_type).toBe('flight_sample_enrichment');
    expect(flightFrameSnapshot.state.telemetry.speedMach).toBeCloseTo(0.88);
    expect(flightFrameSnapshot.state.telemetry.altBaroFt).toBeCloseTo(9800);
  });
});
