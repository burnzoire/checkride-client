const GameEvent = require('./gameEvent');

class KillEvent extends GameEvent {
  constructor(rawEvent) {
    super(rawEvent);
    this.killerUcid = rawEvent.killerUcid;
    this.killerName = rawEvent.killerName;
    this.killerUnitType = rawEvent.killerUnitType;
    this.killerUnitCategory = rawEvent.killerUnitCategory;
    this.killerSide = rawEvent.killerSide;
    this.victimUcid = rawEvent.victimUcid;
    this.victimName = rawEvent.victimName;
    this.victimUnitType = rawEvent.victimUnitType;
    this.victimUnitCategory = rawEvent.victimUnitCategory;
    this.victimSide = rawEvent.victimSide;
    this.weaponName = rawEvent.weaponName;
  }

  prepare() {
    return {
      event_type: this.eventType,
      event: {
        killer_ucid: this.killerUcid,
        killer_name: this.killerName,
        killer_unit_name: this.killerUnitType,
        killer_unit_category: this.killerUnitCategory,
        killer_size: this.killerSide,
        victim_ucid: this.victimUcid,
        victim_name: this.victimName,
        victim_unit_name: this.victimUnitType,
        victim_unit_category: this.victimUnitCategory,
        victim_side: this.victimSide,
        weapon_name: this.weaponName
      }
    };
  }
}

module.exports = KillEvent;
