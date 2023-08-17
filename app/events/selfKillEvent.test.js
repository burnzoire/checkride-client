const SelfKillEvent = require('./selfKillEvent');
const TagDictionary = require('../services/tagDictionary');

jest.mock('../services/tagDictionary');

describe('SelfKillEvent', () => {

  it('prepares the expected payload with correct tags', () => {

    const mockTagDictionary = new TagDictionary();

    const rawEvent = {
      type: "crash",
      playerUcid: "test1",
      playerName: "Test Pilot",
    };

    const event = new SelfKillEvent(rawEvent, mockTagDictionary);
    const preparedPayload = event.prepare();

    expect(preparedPayload).toEqual({
      event_type: 'crash',
      event: {
        player_ucid: "test1",
        player_name: "Test Pilot",
      }
    });
  });
});
