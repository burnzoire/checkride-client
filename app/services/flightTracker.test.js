const { FlightTracker } = require('./flightTracker');

describe('FlightTracker', () => {
  let generateFlightUid;
  let tracker;

  beforeEach(() => {
    generateFlightUid = jest.fn();
    tracker = new FlightTracker(generateFlightUid);
  });

  it('creates and assigns a new flight id on slot entry', () => {
    generateFlightUid.mockReturnValueOnce('flight-1');
    const eventData = {};

    tracker.decorate({ type: 'change_slot', playerUcid: 'pilot', slotId: 'slot', flyable: true }, eventData);

    expect(generateFlightUid).toHaveBeenCalledTimes(1);
    expect(eventData.flight_uid).toBe('flight-1');
  });

  it('ends the current flight and starts a new one when changing slots mid-flight', () => {
    generateFlightUid
      .mockReturnValueOnce('flight-1')
      .mockReturnValueOnce('flight-2');

    tracker.decorate({ type: 'change_slot', playerUcid: 'pilot', slotId: 'slot-a', flyable: true }, { player_ucid: 'pilot' });

    const changeSlotData = { player_ucid: 'pilot', slot_id: 'slot-b', flyable: true };
    tracker.decorate({ type: 'change_slot', playerUcid: 'pilot', slotId: 'slot-b', flyable: true }, changeSlotData);

    expect(changeSlotData.flight_uid).toBe('flight-2');

    const nextEventData = { player_ucid: 'pilot' };
    tracker.decorate({ type: 'takeoff', playerUcid: 'pilot' }, nextEventData);
    expect(nextEventData.flight_uid).toBe('flight-2');
  });

  it('keeps the active flight id across landings and crash events, clearing on disconnect or slot change', () => {
    generateFlightUid
      .mockReturnValueOnce('flight-2')
      .mockReturnValueOnce('flight-3')
      .mockReturnValueOnce('flight-4');

    const initialSlotData = { player_ucid: 'pilot', slot_id: 'slot', flyable: true };
    tracker.decorate({ type: 'change_slot', playerUcid: 'pilot', slotId: 'slot', flyable: true }, initialSlotData);
    expect(initialSlotData.flight_uid).toBe('flight-2');

    const takeoffData = { player_ucid: 'pilot' };
    tracker.decorate({ type: 'takeoff', playerUcid: 'pilot' }, takeoffData);
    expect(takeoffData.flight_uid).toBe('flight-2');

    const landingData = { player_ucid: 'pilot' };
    tracker.decorate({ type: 'landing', playerUcid: 'pilot' }, landingData);
    expect(landingData.flight_uid).toBe('flight-2');

    const crashData = { player_ucid: 'pilot' };
    tracker.decorate({ type: 'crash', playerUcid: 'pilot' }, crashData);
    expect(crashData.flight_uid).toBe('flight-2');

    const disconnectData = { player_ucid: 'pilot' };
    tracker.decorate({ type: 'disconnect', playerUcid: 'pilot' }, disconnectData);
    expect(disconnectData.flight_uid).toBe('flight-2');

    const takeoffAfterDisconnectData = { player_ucid: 'pilot' };
    tracker.decorate({ type: 'takeoff', playerUcid: 'pilot' }, takeoffAfterDisconnectData);
    expect(takeoffAfterDisconnectData.flight_uid).toBe('flight-3');

    const changeSlotNewAirframeData = { player_ucid: 'pilot', slot_id: 'slot-b', flyable: true };
    tracker.decorate({ type: 'change_slot', playerUcid: 'pilot', slotId: 'slot-b', flyable: true }, changeSlotNewAirframeData);
    expect(changeSlotNewAirframeData.flight_uid).toBe('flight-4');

    const takeoffAfterSlotChangeData = { player_ucid: 'pilot' };
    tracker.decorate({ type: 'takeoff', playerUcid: 'pilot' }, takeoffAfterSlotChangeData);
    expect(takeoffAfterSlotChangeData.flight_uid).toBe('flight-4');
  });

  it('propagates killer and victim flight ids during a kill event', () => {
    generateFlightUid
      .mockReturnValueOnce('killer-flight')
      .mockReturnValueOnce('victim-flight');

    tracker.decorate({ type: 'change_slot', playerUcid: 'killer', slotId: 'slotA', flyable: true }, { player_ucid: 'killer' });
    tracker.decorate({ type: 'change_slot', playerUcid: 'victim', slotId: 'slotB', flyable: true }, { player_ucid: 'victim' });

    const killData = { killer_ucid: 'killer', victim_ucid: 'victim' };
    tracker.decorate({ type: 'kill', killerUcid: 'killer', victimUcid: 'victim' }, killData);

    expect(killData.killer_flight_uid).toBe('killer-flight');
    expect(killData.victim_flight_uid).toBe('victim-flight');
  });

  it('drops the tracked flight when the slot is vacated', () => {
    generateFlightUid
      .mockReturnValueOnce('flight-3')
      .mockReturnValueOnce('flight-4');

    tracker.decorate({ type: 'change_slot', playerUcid: 'pilot', slotId: 'slot', flyable: true }, { player_ucid: 'pilot' });

    const leaveData = { player_ucid: 'pilot', slot_id: null, flyable: false };
    tracker.decorate({ type: 'change_slot', playerUcid: 'pilot', slotId: null, flyable: false }, leaveData);
    expect(leaveData.flight_uid).toBe('flight-3');

    const followUpData = { player_ucid: 'pilot' };
    tracker.decorate({ type: 'takeoff', playerUcid: 'pilot' }, followUpData);
    expect(followUpData.flight_uid).toBe('flight-4');
  });

  it('creates new flight ids when events arrive without prior tracking', () => {
    generateFlightUid.mockReturnValueOnce('orphan-flight');
    const eventData = { player_ucid: 'pilot' };

    tracker.decorate({ type: 'takeoff', playerUcid: 'pilot' }, eventData);

    expect(eventData.flight_uid).toBe('orphan-flight');
  });

  it('recreates killer and victim flight ids after a restart', () => {
    generateFlightUid
      .mockReturnValueOnce('killer-flight')
      .mockReturnValueOnce('victim-flight');

    const killData = { killer_ucid: 'killer', victim_ucid: 'victim' };
    tracker.decorate({ type: 'kill', killerUcid: 'killer', victimUcid: 'victim' }, killData);

    expect(killData.killer_flight_uid).toBe('killer-flight');
    expect(killData.victim_flight_uid).toBe('victim-flight');
  });

  it('skips flight creation for connect events', () => {
    tracker.decorate({ type: 'connect', playerUcid: 'pilot' }, { player_ucid: 'pilot' });

    expect(generateFlightUid).not.toHaveBeenCalled();
  });

  it('skips flight creation for disconnect events without an active flight', () => {
    const eventData = { player_ucid: 'pilot' };

    tracker.decorate({ type: 'disconnect', playerUcid: 'pilot' }, eventData);

    expect(generateFlightUid).not.toHaveBeenCalled();
    expect(eventData.flight_uid).toBeUndefined();
  });

  it('clears the active flight when switching to a spectator slot', () => {
    generateFlightUid
      .mockReturnValueOnce('flight-10')
      .mockReturnValueOnce('flight-11');

    tracker.decorate({ type: 'change_slot', playerUcid: 'pilot', slotId: 'slot-a', flyable: true }, { player_ucid: 'pilot' });

    const spectatorData = { player_ucid: 'pilot', slot_id: 'spectators', flyable: false };
    tracker.decorate({ type: 'change_slot', playerUcid: 'pilot', slotId: 'spectators', flyable: false }, spectatorData);
    expect(spectatorData.flight_uid).toBe('flight-10');

    const followUpData = { player_ucid: 'pilot' };
    tracker.decorate({ type: 'takeoff', playerUcid: 'pilot' }, followUpData);
    expect(followUpData.flight_uid).toBe('flight-11');
  });
});
