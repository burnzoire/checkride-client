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
});
