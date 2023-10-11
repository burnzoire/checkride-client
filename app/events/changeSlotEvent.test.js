const ChangeSlotEvent = require('./changeSlotEvent');
const TagDictionary = require('../services/tagDictionary');

jest.mock('../services/tagDictionary');

describe('ChangeSlotEvent', () => {

  it('prepares the expected payload with correct tags', () => {
    const rawEvent = {
      type: "change_slot",
      playerUcid: "test1",
      playerName: "Test Pilot",
      slotId: "1",
      prevSide: "1"
    }

    const mockTagDictionary = new TagDictionary();
    const event = new ChangeSlotEvent(rawEvent, mockTagDictionary);
    const preparedPayload = event.prepare();

    expect(preparedPayload).toEqual({
      event: {
        event_type: 'change_slot',
        event_data: {
          player_ucid: "test1",
          player_name: "Test Pilot",
          slot_id: "1",
          prev_side: "1"
        }
      }
    });
  });
});
