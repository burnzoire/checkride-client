import log from 'electron-log'
import AirfieldEvent from './events/airfieldEvent'
import ChangeSlotEvent from './events/changeSlotEvent'
import ConnectEvent from './events/connectEvent'
import DisconnectEvent from './events/disconnectEvent'
import KillEvent from './events/killEvent'
import PilotEvent from './events/pilotEvent'
import SelfKillEvent from './events/selfKillEvent'

export class InvalidEventTypeError extends Error {
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
  "change_slot": ChangeSlotEvent
};

class EventFactory {
  static create(eventData) {
    return new Promise((resolve, reject) => {
      const GameEvent = eventClasses[eventData.type];
      
      if (GameEvent) {
        resolve(new GameEvent(eventData).prepare());
      } else {
        reject(new InvalidEventTypeError(eventData.type));
      }
    });
  }
}

export default EventFactory
