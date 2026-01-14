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

    const rawEvent = { type: 'change_slot', playerUcid: 'pilot-1', slotId: 'slot-a' };
    const prepared = { event: { event_type: 'change_slot', event_data: { player_ucid: 'pilot-1', slot_id: 'slot-a' } } };

    const result = processor.process(rawEvent, prepared);

    expect(result).not.toBe(prepared);
    expect(result.event.event_data.flight_uid).toBe('flight-uid-1');
    expect(result.event.event_uid).toBe(actualUuid.v5(stableStringify(rawEvent), EVENT_NAMESPACE));
  });

  it('reuses active flight identifier until landing event ends it', () => {
    uuid.v4.mockReturnValueOnce('flight-uid-2');

    const changeSlotEvent = { type: 'change_slot', playerUcid: 'pilot-2', slotId: 'slot-b' };
    const changeSlotPrepared = { event: { event_type: 'change_slot', event_data: { player_ucid: 'pilot-2', slot_id: 'slot-b' } } };
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
    expect(postLandingResult.event.event_data.flight_uid).toBeUndefined();
  });

  it('records participant flight identifiers on kill events', () => {
    uuid.v4
      .mockReturnValueOnce('flight-killer')
      .mockReturnValueOnce('flight-victim');

    processor.process(
      { type: 'change_slot', playerUcid: 'killer', slotId: 'slot-1' },
      { event: { event_type: 'change_slot', event_data: { player_ucid: 'killer', slot_id: 'slot-1' } } }
    );

    processor.process(
      { type: 'change_slot', playerUcid: 'victim', slotId: 'slot-2' },
      { event: { event_type: 'change_slot', event_data: { player_ucid: 'victim', slot_id: 'slot-2' } } }
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
      { type: 'change_slot', playerUcid: 'pilot-3', slotId: 'slot-c' },
      { event: { event_type: 'change_slot', event_data: { player_ucid: 'pilot-3', slot_id: 'slot-c' } } }
    );

    const leaveSlotEvent = { type: 'change_slot', playerUcid: 'pilot-3', slotId: null };
    const leaveSlotPrepared = { event: { event_type: 'change_slot', event_data: { player_ucid: 'pilot-3', slot_id: null } } };
    const leaveSlotResult = processor.process(leaveSlotEvent, leaveSlotPrepared);
    expect(leaveSlotResult.event.event_data.flight_uid).toBe('flight-uid-3');

    const followUpEvent = { type: 'takeoff', playerUcid: 'pilot-3' };
    const followUpPrepared = { event: { event_type: 'takeoff', event_data: { player_ucid: 'pilot-3' } } };
    const followUpResult = processor.process(followUpEvent, followUpPrepared);
    expect(followUpResult.event.event_data.flight_uid).toBeUndefined();
  });
});
