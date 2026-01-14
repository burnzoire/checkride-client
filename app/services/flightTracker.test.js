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

    tracker.decorate({ type: 'change_slot', playerUcid: 'pilot', slotId: 'slot' }, eventData);

    expect(generateFlightUid).toHaveBeenCalledTimes(1);
    expect(eventData.flight_uid).toBe('flight-1');
  });

  it('ends the current flight and starts a new one when changing slots mid-flight', () => {
    generateFlightUid
      .mockReturnValueOnce('flight-1')
      .mockReturnValueOnce('flight-2');

    tracker.decorate({ type: 'change_slot', playerUcid: 'pilot', slotId: 'slot-a' }, { player_ucid: 'pilot' });

    const changeSlotData = { player_ucid: 'pilot', slot_id: 'slot-b' };
    tracker.decorate({ type: 'change_slot', playerUcid: 'pilot', slotId: 'slot-b' }, changeSlotData);

    expect(changeSlotData.flight_uid).toBe('flight-1');

    const nextEventData = { player_ucid: 'pilot' };
    tracker.decorate({ type: 'takeoff', playerUcid: 'pilot' }, nextEventData);
    expect(nextEventData.flight_uid).toBe('flight-2');
  });

  it('keeps the active flight id across landings and clears it on an end event', () => {
    generateFlightUid
      .mockReturnValueOnce('flight-2')
      .mockReturnValueOnce('flight-3');
    const takeoffData = { player_ucid: 'pilot' };
    const landingData = { player_ucid: 'pilot' };

    tracker.decorate({ type: 'change_slot', playerUcid: 'pilot', slotId: 'slot' }, { player_ucid: 'pilot', slot_id: 'slot' });
    tracker.decorate({ type: 'takeoff', playerUcid: 'pilot' }, takeoffData);
    tracker.decorate({ type: 'landing', playerUcid: 'pilot' }, landingData);

    expect(takeoffData.flight_uid).toBe('flight-2');
    expect(landingData.flight_uid).toBe('flight-2');

    const postLandingData = { player_ucid: 'pilot' };
    tracker.decorate({ type: 'takeoff', playerUcid: 'pilot' }, postLandingData);
    expect(postLandingData.flight_uid).toBe('flight-2');

    const crashData = { player_ucid: 'pilot' };
    tracker.decorate({ type: 'crash', playerUcid: 'pilot' }, crashData);
    expect(crashData.flight_uid).toBe('flight-2');

    const postCrashData = { player_ucid: 'pilot' };
    tracker.decorate({ type: 'takeoff', playerUcid: 'pilot' }, postCrashData);
    expect(postCrashData.flight_uid).toBe('flight-3');
  });

  it('propagates killer and victim flight ids during a kill event', () => {
    generateFlightUid
      .mockReturnValueOnce('killer-flight')
      .mockReturnValueOnce('victim-flight');

    tracker.decorate({ type: 'change_slot', playerUcid: 'killer', slotId: 'slotA' }, { player_ucid: 'killer' });
    tracker.decorate({ type: 'change_slot', playerUcid: 'victim', slotId: 'slotB' }, { player_ucid: 'victim' });

    const killData = { killer_ucid: 'killer', victim_ucid: 'victim' };
    tracker.decorate({ type: 'kill', killerUcid: 'killer', victimUcid: 'victim' }, killData);

    expect(killData.killer_flight_uid).toBe('killer-flight');
    expect(killData.victim_flight_uid).toBe('victim-flight');
  });

  it('drops the tracked flight when the slot is vacated', () => {
    generateFlightUid
      .mockReturnValueOnce('flight-3')
      .mockReturnValueOnce('flight-4');

    tracker.decorate({ type: 'change_slot', playerUcid: 'pilot', slotId: 'slot' }, { player_ucid: 'pilot' });

    const leaveData = { player_ucid: 'pilot', slot_id: null };
    tracker.decorate({ type: 'change_slot', playerUcid: 'pilot', slotId: null }, leaveData);
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
});
