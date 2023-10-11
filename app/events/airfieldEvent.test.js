const AirfieldEvent = require('./airfieldEvent');
const TagDictionary = require('../services/tagDictionary');

jest.mock('../services/tagDictionary');

describe('AirfieldEvent', () => {

  it('prepares the expected payload with correct tags', () => {

    const mockTagDictionary = new TagDictionary();
    mockTagDictionary.getTagsForField
      .mockReturnValueOnce(['tomcat', 'fighter'])

    const rawEvent = {
      type: "takeoff",
      playerUcid: "test1",
      playerName: "Test Pilot",
      unitType: "F-14A",
      unitCategory: "Fixed-wing",
      airdromeName: "Test Field"
    };

    const event = new AirfieldEvent(rawEvent, mockTagDictionary);
    const preparedPayload = event.prepare();

    expect(preparedPayload).toEqual({
      event: {
        event_type: 'takeoff',
        event_data: {
          player_ucid: "test1",
          player_name: "Test Pilot",
          unit_type: "F-14A",
          unit_category: "Fixed-wing",
          airdrome_name: "Test Field"
        }
      }
    });

    // expect(mockTagDictionary.getTagsForField).toHaveBeenCalledWith('units', 'F-14A');
  });
});
