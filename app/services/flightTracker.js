const { v4: uuidv4 } = require('uuid');

const FLIGHT_END_EVENTS = new Set(['landing', 'crash', 'eject', 'pilot_death', 'self_kill', 'disconnect']);

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
    const assignments = {};
    const participants = this.extractParticipantUcids(rawEvent);

    participants.forEach((ucid) => {
      const existingFlight = this.activeFlights.get(ucid);
      if (existingFlight) {
        assignments[ucid] = existingFlight;
      }
    });

    if (rawEvent.type === 'change_slot' && rawEvent.playerUcid) {
      if (rawEvent.slotId) {
        const flightUid = this.generateFlightUid();
        this.activeFlights.set(rawEvent.playerUcid, flightUid);
        assignments[rawEvent.playerUcid] = flightUid;
      } else {
        const existingFlight = this.activeFlights.get(rawEvent.playerUcid);
        if (existingFlight) {
          assignments[rawEvent.playerUcid] = existingFlight;
        }
        this.activeFlights.delete(rawEvent.playerUcid);
      }

      return assignments;
    }

    if (rawEvent.playerUcid && FLIGHT_END_EVENTS.has(rawEvent.type)) {
      const existingFlight = this.activeFlights.get(rawEvent.playerUcid);
      if (existingFlight) {
        assignments[rawEvent.playerUcid] = existingFlight;
      }
      this.activeFlights.delete(rawEvent.playerUcid);
      return assignments;
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
