const { v4: uuidv4 } = require('uuid');

const FLIGHT_END_EVENTS = new Set(['disconnect', 'change_slot']);

class FlightTracker {
  constructor(generateFlightUid = uuidv4) {
    this.generateFlightUid = generateFlightUid;
    this.activeFlights = new Map();
  }

  decorate(rawEvent, eventData) {
    const assignments = this.updateAssignments(rawEvent);

    if (eventData) {
      this.attachAssignments(rawEvent, eventData, assignments);
    }

    return assignments;
  }

  updateAssignments(rawEvent) {
    if (!rawEvent || typeof rawEvent !== 'object') {
      return {};
    }

    if (rawEvent.type === 'connect') {
      return {};
    }

    const assignments = {};
    const participants = this.extractParticipantUcids(rawEvent);

    participants.forEach((ucid) => {
      const existingFlight = this.activeFlights.get(ucid);
      if (existingFlight) {
        assignments[ucid] = existingFlight;
      }
    });

    if (rawEvent.type === 'change_slot' && rawEvent.playerUcid) {
      const existingFlight = this.activeFlights.get(rawEvent.playerUcid);

      if (rawEvent.flyable !== false && rawEvent.slotId) {
        if (!existingFlight) {
          const newFlightUid = this.generateFlightUid();
          this.activeFlights.set(rawEvent.playerUcid, newFlightUid);
          assignments[rawEvent.playerUcid] = newFlightUid;
        } else {
          const nextFlightUid = this.generateFlightUid();
          this.activeFlights.set(rawEvent.playerUcid, nextFlightUid);
          assignments[rawEvent.playerUcid] = nextFlightUid;
        }
      } else {
        if (existingFlight) {
          assignments[rawEvent.playerUcid] = existingFlight;
        }
        this.activeFlights.delete(rawEvent.playerUcid);
      }

      return assignments;
    }

    if (!FLIGHT_END_EVENTS.has(rawEvent.type)) {
      participants.forEach((ucid) => {
        if (!assignments[ucid]) {
          const newFlightUid = this.generateFlightUid();
          this.activeFlights.set(ucid, newFlightUid);
          assignments[ucid] = newFlightUid;
        }
      });
    }

    if (rawEvent.playerUcid && FLIGHT_END_EVENTS.has(rawEvent.type)) {
      this.activeFlights.delete(rawEvent.playerUcid);
    }

    return assignments;
  }

  attachAssignments(rawEvent, eventData, assignments) {
    const { playerUcid, killerUcid, victimUcid } = rawEvent;

    if (playerUcid && assignments[playerUcid]) {
      eventData.flight_uid = assignments[playerUcid];
    }

    if (killerUcid && assignments[killerUcid]) {
      eventData.killer_flight_uid = assignments[killerUcid];
    }

    if (victimUcid && assignments[victimUcid]) {
      eventData.victim_flight_uid = assignments[victimUcid];
    }
  }

  extractParticipantUcids(rawEvent) {
    const keys = ['playerUcid', 'killerUcid', 'victimUcid'];
    const ucids = new Set();

    keys.forEach((key) => {
      const value = rawEvent[key];
      if (typeof value === 'string' && value.length > 0) {
        ucids.add(value);
      }
    });

    return Array.from(ucids);
  }
}

module.exports = {
  FlightTracker,
  FLIGHT_END_EVENTS
};
