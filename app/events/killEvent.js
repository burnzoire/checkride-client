const GameEvent = require('./gameEvent');

class KillEvent extends GameEvent {
  constructor(rawEvent) {
    super(rawEvent);
    this.killerUcid = rawEvent.killerUcid;
    this.killerName = rawEvent.killerName;
    this.killerUnitType = rawEvent.killerUnitType;
    this.killerSide = rawEvent.killerSide;
    this.victimUcid = rawEvent.victimUcid;
    this.victimName = rawEvent.victimName;
    this.victimUnitType = rawEvent.victimUnitType;
    this.victimSide = rawEvent.victimSide;
    this.weaponName = rawEvent.weaponName;
  }

  prepare() {
    return {
      event: {
        event_type: this.eventType,
        event_data: {
          killer_ucid: this.killerUcid,
          killer_name: this.killerName,
          killer_unit_name: this.killerUnitType,
          killer_side: this.killerSide,
          victim_ucid: this.victimUcid,
          victim_name: this.victimName,
          victim_unit_name: this.victimUnitType,
          victim_side: this.victimSide,
          weapon_name: this.weaponName,
        }
      }
    };
  }
}

module.exports = KillEvent;
