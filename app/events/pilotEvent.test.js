const PilotEvent = require('./pilotEvent');
const TagDictionary = require('../services/tagDictionary');

jest.mock('../services/tagDictionary');

describe('PilotEvent', () => {

  it('prepares the expected payload with correct tags', () => {

    const mockTagDictionary = new TagDictionary();
    mockTagDictionary.getTagsForField
      .mockReturnValueOnce(['tomcat', 'fighter'])

    const rawEvent = {
      type: "crash",
      playerUcid: "test1",
      playerName: "Test Pilot",
      unitType: "F-14A",
      unitCategory: "Fixed-wing"
    };

    const event = new PilotEvent(rawEvent, mockTagDictionary);
    const preparedPayload = event.prepare();

    expect(preparedPayload).toEqual({
      event_type: 'crash',
      event: {
        player_ucid: "test1",
        player_name: "Test Pilot",
        unit_type: "F-14A",
        unit_category: "Fixed-wing",
      }
    });

    // expect(mockTagDictionary.getTagsForField).toHaveBeenCalledWith('units', 'F-14A');
  });
});
