const { EventFactory, InvalidEventTypeError } = require('./eventFactory');
const AirfieldEvent = require('../events/airfieldEvent');
const ChangeSlotEvent = require('../events/changeSlotEvent');
const ConnectEvent = require('../events/connectEvent');
const DisconnectEvent = require('../events/disconnectEvent');
const KillEvent = require('../events/killEvent');
const PilotEvent = require('../events/pilotEvent');
const SelfKillEvent = require('../events/selfKillEvent');
const TagDictionary = require('../services/tagDictionary');

jest.mock('../services/tagDictionary');

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
      const mockTagDictionary = jest.fn();

      const result = await EventFactory.create(eventData, mockTagDictionary);

      expect(result).toBeInstanceOf(expectedClass);
    });

    it(`prepares payload for instance of ${expectedClass}`, async () => {
      const eventData = { type, otherData: 'other' };

      const mockTagDictionary = new TagDictionary()

      mockTagDictionary.getTagsForField.mockReturnValue(['tag1', 'tag2']);

      const result = await EventFactory.create(eventData, mockTagDictionary);

      expect(result.prepare().event.event_type).toEqual(type);
    })
  });

  it('throws an error when event type is invalid', async () => {
    const eventData = { type: 'invalid', otherData: 'other' };
    const mockTagDictionary = jest.fn();

    await expect(EventFactory.create(eventData, mockTagDictionary)).rejects.toThrow(InvalidEventTypeError);
  });

});
