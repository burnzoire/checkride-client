jest.mock('uuid', () => {
  const actual = jest.requireActual('uuid');
  const v4 = jest.fn();
  const v5 = actual.v5;
  v5.URL = actual.v5.URL;

  return {
    ...actual,
    v4,
    v5
  };
});

const uuid = require('uuid');
const actualUuid = jest.requireActual('uuid');
const { EventProcessor, stableStringify } = require('./eventProcessor');

const EVENT_NAMESPACE = actualUuid.v5('checkride-client:event', actualUuid.v5.URL);

describe('EventProcessor', () => {
  let processor;

  beforeEach(() => {
    uuid.v4.mockReset();
    processor = new EventProcessor();
  });

  it('generates flight and event identifiers on slot entry', () => {
    uuid.v4.mockReturnValueOnce('flight-uid-1');

    const rawEvent = { type: 'change_slot', playerUcid: 'pilot-1', slotId: 'slot-a', flyable: true };
    const prepared = { event: { event_type: 'change_slot', event_data: { player_ucid: 'pilot-1', slot_id: 'slot-a', flyable: true } } };

    const result = processor.process(rawEvent, prepared);

    expect(result).not.toBe(prepared);
    expect(result.event.event_data.flight_uid).toBe('flight-uid-1');
    const { event_uid: generatedUid, ...eventWithoutUid } = result.event;
    expect(generatedUid).toBe(actualUuid.v5(stableStringify(eventWithoutUid), EVENT_NAMESPACE));
  });

  it('ends the current flight and seeds a new one on slot change mid-flight', () => {
    uuid.v4
      .mockReturnValueOnce('flight-uid-1')
      .mockReturnValueOnce('flight-uid-2');

    processor.process(
      { type: 'change_slot', playerUcid: 'pilot-1', slotId: 'slot-a', flyable: true },
      { event: { event_type: 'change_slot', event_data: { player_ucid: 'pilot-1', slot_id: 'slot-a', flyable: true } } }
    );

    const secondChangeSlot = { type: 'change_slot', playerUcid: 'pilot-1', slotId: 'slot-b', flyable: true };
    const secondPrepared = { event: { event_type: 'change_slot', event_data: { player_ucid: 'pilot-1', slot_id: 'slot-b', flyable: true } } };
    const secondResult = processor.process(secondChangeSlot, secondPrepared);

    expect(secondResult.event.event_data.flight_uid).toBe('flight-uid-1');

    const followup = processor.process(
      { type: 'takeoff', playerUcid: 'pilot-1' },
      { event: { event_type: 'takeoff', event_data: { player_ucid: 'pilot-1' } } }
    );

    expect(followup.event.event_data.flight_uid).toBe('flight-uid-2');
  });

  it('keeps the flight active across landings and only clears on end events', () => {
    uuid.v4.mockReturnValueOnce('flight-uid-2');

    const changeSlotEvent = { type: 'change_slot', playerUcid: 'pilot-2', slotId: 'slot-b', flyable: true };
    const changeSlotPrepared = { event: { event_type: 'change_slot', event_data: { player_ucid: 'pilot-2', slot_id: 'slot-b', flyable: true } } };
    processor.process(changeSlotEvent, changeSlotPrepared);

    const takeoffEvent = { type: 'takeoff', playerUcid: 'pilot-2' };
    const takeoffPrepared = { event: { event_type: 'takeoff', event_data: { player_ucid: 'pilot-2' } } };
    const takeoffResult = processor.process(takeoffEvent, takeoffPrepared);
    expect(takeoffResult.event.event_data.flight_uid).toBe('flight-uid-2');

    const landingEvent = { type: 'landing', playerUcid: 'pilot-2' };
    const landingPrepared = { event: { event_type: 'landing', event_data: { player_ucid: 'pilot-2' } } };
    const landingResult = processor.process(landingEvent, landingPrepared);
    expect(landingResult.event.event_data.flight_uid).toBe('flight-uid-2');

    const postLandingEvent = { type: 'takeoff', playerUcid: 'pilot-2' };
    const postLandingPrepared = { event: { event_type: 'takeoff', event_data: { player_ucid: 'pilot-2' } } };
    const postLandingResult = processor.process(postLandingEvent, postLandingPrepared);
    expect(postLandingResult.event.event_data.flight_uid).toBe('flight-uid-2');

    const crashEvent = { type: 'crash', playerUcid: 'pilot-2' };
    const crashPrepared = { event: { event_type: 'crash', event_data: { player_ucid: 'pilot-2' } } };
    const crashResult = processor.process(crashEvent, crashPrepared);
    expect(crashResult.event.event_data.flight_uid).toBe('flight-uid-2');

    const postCrashEvent = { type: 'takeoff', playerUcid: 'pilot-2' };
    const postCrashPrepared = { event: { event_type: 'takeoff', event_data: { player_ucid: 'pilot-2' } } };
    const postCrashResult = processor.process(postCrashEvent, postCrashPrepared);
    expect(postCrashResult.event.event_data.flight_uid).toBeUndefined();
  });

  it('records participant flight identifiers on kill events', () => {
    uuid.v4
      .mockReturnValueOnce('flight-killer')
      .mockReturnValueOnce('flight-victim');

    processor.process(
      { type: 'change_slot', playerUcid: 'killer', slotId: 'slot-1', flyable: true },
      { event: { event_type: 'change_slot', event_data: { player_ucid: 'killer', slot_id: 'slot-1', flyable: true } } }
    );

    processor.process(
      { type: 'change_slot', playerUcid: 'victim', slotId: 'slot-2', flyable: true },
      { event: { event_type: 'change_slot', event_data: { player_ucid: 'victim', slot_id: 'slot-2', flyable: true } } }
    );

    const killEvent = {
      type: 'kill',
      killerUcid: 'killer',
      victimUcid: 'victim',
      weaponName: 'weapon'
    };
    const killPrepared = {
      event: {
        event_type: 'kill',
        event_data: {
          killer_ucid: 'killer',
          victim_ucid: 'victim',
          weapon_name: 'weapon'
        }
      }
    };

    const result = processor.process(killEvent, killPrepared);

    expect(result.event.event_data.killer_flight_uid).toBe('flight-killer');
    expect(result.event.event_data.victim_flight_uid).toBe('flight-victim');
  });

  it('clears flight identifier when slot is vacated', () => {
    uuid.v4.mockReturnValueOnce('flight-uid-3');

    processor.process(
      { type: 'change_slot', playerUcid: 'pilot-3', slotId: 'slot-c', flyable: true },
      { event: { event_type: 'change_slot', event_data: { player_ucid: 'pilot-3', slot_id: 'slot-c', flyable: true } } }
    );

    const leaveSlotEvent = { type: 'change_slot', playerUcid: 'pilot-3', slotId: null, flyable: false };
    const leaveSlotPrepared = { event: { event_type: 'change_slot', event_data: { player_ucid: 'pilot-3', slot_id: null, flyable: false } } };
    const leaveSlotResult = processor.process(leaveSlotEvent, leaveSlotPrepared);
    expect(leaveSlotResult.event.event_data.flight_uid).toBe('flight-uid-3');

    const followUpEvent = { type: 'takeoff', playerUcid: 'pilot-3' };
    const followUpPrepared = { event: { event_type: 'takeoff', event_data: { player_ucid: 'pilot-3' } } };
    const followUpResult = processor.process(followUpEvent, followUpPrepared);
    expect(followUpResult.event.event_data.flight_uid).toBeUndefined();
  });
});
