const DisconnectEvent = require('./disconnectEvent');
const TagDictionary = require('../services/tagDictionary');

jest.mock('../services/tagDictionary');

describe('DisconnectEvent', () => {

  it('prepares the expected payload with correct tags', () => {
    const rawEvent = {
      type: "disconnect",
      playerUcid: "test1",
      playerName: "Test Pilot",
      playerSide: "1",
      reasonCode: "1"
    }

    const mockTagDictionary = new TagDictionary();
    const event = new DisconnectEvent(rawEvent, mockTagDictionary);
    const preparedPayload = event.prepare();

    expect(preparedPayload).toEqual({
      event: {
        event_type: 'disconnect',
        event_data: {
          player_ucid: "test1",
          player_name: "Test Pilot",
          player_side: "1",
          reason_code: "1"
        }
      }
    });
  });
});
