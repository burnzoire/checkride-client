const GameEvent = require('./gameEvent');

class GradingEvent extends GameEvent {
  constructor(rawEvent) {
    super(rawEvent);
    this.playerUcid = rawEvent.playerUcid;
    this.playerName = rawEvent.playerName;
    this.unitType = rawEvent.unitType;
    this.lsoGrade = rawEvent.lsoGrade;
    this.wire = rawEvent.wire;
    this.night = rawEvent.night;
    this.gradingRaw = rawEvent.gradingRaw;
    this.carrierName = rawEvent.carrierName;
    this.source = rawEvent.source || 'mission';
  }

  prepare() {
    const eventData = {
      player_ucid: this.playerUcid,
      player_name: this.playerName,
      unit_type: this.unitType,
      lso_grade: this.lsoGrade,
      grading_raw: this.gradingRaw,
      airdrome_name: this.carrierName,
    };

    if (Number.isFinite(this.wire)) {
      eventData.wire = this.wire;
    }

    if (typeof this.night === 'boolean') {
      eventData.night = this.night;
    }

    return {
      event: {
        event_type: this.eventType,
        occurred_at: this.occurredAt,
        source: this.source,
        event_data: eventData
      }
    };
  }
}

module.exports = GradingEvent;
