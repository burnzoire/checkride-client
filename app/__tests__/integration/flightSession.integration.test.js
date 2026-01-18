const { attachEventPipeline } = require('../../appInit');

describe('Flight session integration', () => {
  let apiClientMock;
  let discordClientMock;
  let udpServer;
  let savedPayloads;

  beforeEach(() => {
    savedPayloads = [];

    apiClientMock = {
      saveEvent: jest.fn((payload) => {
        savedPayloads.push(payload);
        return Promise.resolve({ summary: 'ok', publish: false });
      })
    };

    discordClientMock = {
      send: jest.fn().mockResolvedValue()
    };

    udpServer = {};

    attachEventPipeline({ udpServer, apiClient: apiClientMock, discordClient: discordClientMock });
  });

  it('preserves flight ids across landings and clears them on end events', async () => {
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

    const firstFlightUid = savedPayloads[0].event.event_data.flight_uid;
    expect(firstFlightUid).toBeDefined();

    const takeoffFlightUid = savedPayloads[1].event.event_data.flight_uid;
    expect(takeoffFlightUid).toBe(firstFlightUid);

    const landingFlightUid = savedPayloads[2].event.event_data.flight_uid;
    expect(landingFlightUid).toBe(firstFlightUid);

    const postLandingFlightUid = savedPayloads[3].event.event_data.flight_uid;
    expect(postLandingFlightUid).toBe(firstFlightUid);

    const changefirstFlightUid = savedPayloads[4].event.event_data.flight_uid;
    expect(changefirstFlightUid).not.toBe(firstFlightUid);

    const secondFlightUid = savedPayloads[5].event.event_data.flight_uid;
    expect(secondFlightUid).toBeDefined();
    expect(secondFlightUid).toBe(changefirstFlightUid);

    const crashFlightUid = savedPayloads[6].event.event_data.flight_uid;
    expect(crashFlightUid).toBe(secondFlightUid);

    const postCrashFlightUid = savedPayloads[7].event.event_data.flight_uid;
    expect(postCrashFlightUid).toBeDefined();
    expect(postCrashFlightUid).toBe(secondFlightUid);
  });

  it('generates new flight ids after pipeline reinitialization', async () => {
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

    const initialFlightUid = savedPayloads[0].event.event_data.flight_uid;
    expect(initialFlightUid).toBeDefined();

    attachEventPipeline({ udpServer, apiClient: apiClientMock, discordClient: discordClientMock });

    await udpServer.onEvent(landingEvent);

    expect(savedPayloads).toHaveLength(3);

    const restartedFlightUid = savedPayloads[2].event.event_data.flight_uid;
    expect(restartedFlightUid).toBeDefined();
    expect(restartedFlightUid).not.toBe(initialFlightUid);
  });

  it('waits for a flyable slot after connect before generating flights', async () => {
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

    const connectPayloadFlight = savedPayloads[0].event.event_data.flight_uid;
    expect(connectPayloadFlight).toBeUndefined();

    const spectatorPayloadFlight = savedPayloads[1].event.event_data.flight_uid;
    expect(spectatorPayloadFlight).toBeUndefined();

    const slotPayloadFlight = savedPayloads[2].event.event_data.flight_uid;
    expect(slotPayloadFlight).toBeDefined();

    const takeoffPayloadFlight = savedPayloads[3].event.event_data.flight_uid;
    expect(takeoffPayloadFlight).toBe(slotPayloadFlight);
  });
});
