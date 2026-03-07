const AirfieldEvent = require('../events/airfieldEvent');
const ChangeSlotEvent = require('../events/changeSlotEvent');
const ConnectEvent = require('../events/connectEvent');
const DisconnectEvent = require('../events/disconnectEvent');
const GradingEvent = require('../events/gradingEvent');
const KillEvent = require('../events/killEvent');
const PilotEvent = require('../events/pilotEvent');
const RefuelEvent = require('../events/refuelEvent');
const SelfKillEvent = require('../events/selfKillEvent');

class InvalidEventTypeError extends Error {
  constructor(eventType) {
    super(`Invalid event type: ${eventType}`);
    this.name = 'InvalidEventTypeError';
  }
}

const eventClasses = {
  "kill": KillEvent,
  "takeoff": AirfieldEvent,
  "landing": AirfieldEvent,
  "crash": PilotEvent,
  "eject": PilotEvent,
  "pilot_death": PilotEvent,
  "self_kill": SelfKillEvent,
  "connect": ConnectEvent,
  "disconnect": DisconnectEvent,
  "change_slot": ChangeSlotEvent,
  "grading": GradingEvent,
  "refuel_enrichment": RefuelEvent
};

class EventFactory {
  static create(eventData) {
    return new Promise((resolve, reject) => {
      const GameEvent = eventClasses[eventData.type];

      if (GameEvent) {
        resolve(new GameEvent(eventData));
      } else {
        reject(new InvalidEventTypeError(eventData.type));
      }
    });
  }
}

module.exports = {
  EventFactory,
  InvalidEventTypeError
}
