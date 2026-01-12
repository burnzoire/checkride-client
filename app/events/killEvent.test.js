const KillEvent = require('./killEvent');

describe('KillEvent', () => {
  it('prepares the expected payload', () => {
    const rawEvent = {
      type: 'kill',
      killerUcid: 'test1',
      killerName: 'Test Pilot',
      killerUnitType: 'F-14A',
      killerSide: 'blue',
      victimUcid: 'test2',
      victimName: 'Test Pilot 2',
      victimUnitType: 'JF-17',
      victimSide: 'red',
      weaponName: 'AIM-9L'
    };

    const event = new KillEvent(rawEvent);
    const preparedPayload = event.prepare();

    expect(preparedPayload).toEqual({
      event: {
        event_type: 'kill',
        event_data: {
          killer_ucid: 'test1',
          killer_name: 'Test Pilot',
          killer_unit_name: 'F-14A',
          killer_side: 'blue',
          victim_ucid: 'test2',
          victim_name: 'Test Pilot 2',
          victim_unit_name: 'JF-17',
          victim_side: 'red',
          weapon_name: 'AIM-9L',
        }
      }
    });
  });
});
