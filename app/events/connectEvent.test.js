const ConnectEvent = require('./connectEvent');
const TagDictionary = require('../services/tagDictionary');

jest.mock('../services/tagDictionary');

describe('ConnectEvent', () => {

  it('prepares the expected payload with correct tags', () => {
    const rawEvent = {
      type: "connect",
      playerUcid: "test1",
      playerName: "Test Pilot"
    }

    const mockTagDictionary = new TagDictionary();
    const event = new ConnectEvent(rawEvent, mockTagDictionary);
    const preparedPayload = event.prepare();

    expect(preparedPayload).toEqual({
      event: {
        event_type: 'connect',
        event_data: {
          player_ucid: "test1",
          player_name: "Test Pilot",
        }
      }
    });
  });
});
