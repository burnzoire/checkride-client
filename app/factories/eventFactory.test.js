const { EventFactory, InvalidEventTypeError } = require('./eventFactory');
const AirfieldEvent = require('../events/airfieldEvent');
const ChangeSlotEvent = require('../events/changeSlotEvent');
const ConnectEvent = require('../events/connectEvent');
const DisconnectEvent = require('../events/disconnectEvent');
const KillEvent = require('../events/killEvent');
const PilotEvent = require('../events/pilotEvent');
const SelfKillEvent = require('../events/selfKillEvent');

describe('EventFactory', () => {

  describe.each([
    { type: 'kill', expectedClass: KillEvent },
    { type: 'takeoff', expectedClass: AirfieldEvent },
    { type: 'landing', expectedClass: AirfieldEvent },
    { type: 'crash', expectedClass: PilotEvent },
    { type: 'eject', expectedClass: PilotEvent },
    { type: 'pilot_death', expectedClass: PilotEvent },
    { type: 'self_kill', expectedClass: SelfKillEvent },
    { type: 'connect', expectedClass: ConnectEvent },
    { type: 'disconnect', expectedClass: DisconnectEvent },
    { type: 'change_slot', expectedClass: ChangeSlotEvent }
  ])('creates an instance of the correct event class based on event type', ({ type, expectedClass }) => {

    it(`returns an instance of ${expectedClass.name} when type is ${type}`, async () => {
      const eventData = { type, ... { otherData: 'other' }};

      const result = await EventFactory.create(eventData);

      expect(result).toBeInstanceOf(expectedClass);
    });

    it(`prepares payload for instance of ${expectedClass}`, async () => {
      const eventData = { type, otherData: 'other' };

      const result = await EventFactory.create(eventData);

      expect(result.prepare().event.event_type).toEqual(type);
    })
  });

  it('throws an error when event type is invalid', async () => {
    const eventData = { type: 'invalid', otherData: 'other' };
    
    await expect(EventFactory.create(eventData)).rejects.toThrow(InvalidEventTypeError);
  });

});
