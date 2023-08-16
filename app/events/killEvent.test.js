const KillEvent = require('./killEvent');
const TagDictionary = require('../services/tagDictionary');

jest.mock('../services/tagDictionary');

describe('KillEvent', () => {
  it('prepares the expected payload with correct tags', () => {

    const mockTagDictionary = new TagDictionary();
    mockTagDictionary.getTagsForField
      .mockReturnValueOnce(['tomcat', 'fighter'])
      .mockReturnValueOnce(['jeff', 'fighter'])
      .mockReturnValueOnce(['sidewinder', 'srm', 'fox2']);

    const rawEvent = {
      type: 'kill',
      killerUcid: 'test1',
      killerName: 'Test Pilot',
      killerUnitType: 'F-14A',
      killerUnitCategory: 'Fixed-wing',
      killerSide: 'blue',
      victimUcid: 'test2',
      victimName: 'Test Pilot 2',
      victimUnitType: 'JF-17',
      victimUnitCategory: 'Fixed-wing',
      victimSide: 'red',
      weaponName: 'AIM-9L'
    };

    const event = new KillEvent(rawEvent, mockTagDictionary);
    const preparedPayload = event.prepare();

    expect(preparedPayload).toEqual({
      event_type: 'kill',
      event: {
        killer_ucid: 'test1',
        killer_name: 'Test Pilot',
        killer_unit_name: 'F-14A',
        killer_unit_tags: ['tomcat', 'fighter'],
        killer_unit_category: 'Fixed-wing',
        killer_size: 'blue',
        victim_ucid: 'test2',
        victim_name: 'Test Pilot 2',
        victim_unit_name: 'JF-17',
        victim_unit_tags: ['jeff', 'fighter'],
        victim_unit_category: 'Fixed-wing',
        victim_side: 'red',
        weapon_name: 'AIM-9L',
        weapon_tags: ['sidewinder', 'srm', 'fox2']
      }
    });

    expect(mockTagDictionary.getTagsForField).toHaveBeenCalledWith('units', 'F-14A');
    expect(mockTagDictionary.getTagsForField).toHaveBeenCalledWith('units', 'JF-17');
    expect(mockTagDictionary.getTagsForField).toHaveBeenCalledWith('weapons', 'AIM-9L');
  });
});
