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

  it('reuses the active flight id until a landing clears it', () => {
    generateFlightUid.mockReturnValueOnce('flight-2');
    const takeoffData = { player_ucid: 'pilot' };
    const landingData = { player_ucid: 'pilot' };

    tracker.decorate({ type: 'change_slot', playerUcid: 'pilot', slotId: 'slot' }, { player_ucid: 'pilot', slot_id: 'slot' });
    tracker.decorate({ type: 'takeoff', playerUcid: 'pilot' }, takeoffData);
    tracker.decorate({ type: 'landing', playerUcid: 'pilot' }, landingData);

    expect(takeoffData.flight_uid).toBe('flight-2');
    expect(landingData.flight_uid).toBe('flight-2');

    const postLandingData = { player_ucid: 'pilot' };
    tracker.decorate({ type: 'takeoff', playerUcid: 'pilot' }, postLandingData);
    expect(postLandingData.flight_uid).toBeUndefined();
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
    generateFlightUid.mockReturnValueOnce('flight-3');

    tracker.decorate({ type: 'change_slot', playerUcid: 'pilot', slotId: 'slot' }, { player_ucid: 'pilot' });

    const leaveData = { player_ucid: 'pilot', slot_id: null };
    tracker.decorate({ type: 'change_slot', playerUcid: 'pilot', slotId: null }, leaveData);
    expect(leaveData.flight_uid).toBe('flight-3');

    const followUpData = { player_ucid: 'pilot' };
    tracker.decorate({ type: 'takeoff', playerUcid: 'pilot' }, followUpData);
    expect(followUpData.flight_uid).toBeUndefined();
  });
});
