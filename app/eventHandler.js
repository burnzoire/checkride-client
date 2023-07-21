import log from 'electron-log'
import APIClient from './apiClient'
import discord from './discord'
import AirfieldEvent from './events/airfieldEvent'
import ChangeSlotEvent from './events/changeSlotEvent'
import ConnectEvent from './events/connectEvent'
import DisconnectEvent from './events/disconnectEvent'
import KillEvent from './events/killEvent'
import PilotEvent from './events/pilotEvent'
import SelfKillEvent from './events/selfKillEvent'

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

export default function handleEvent(msg) {
  const api = new APIClient();

  let event = JSON.parse(msg)
  const path = "/events"
  log.debug("Event type: " + event.type)
  const GameEvent = eventClasses[event.type];

  if (GameEvent) {
    const gameEvent = new GameEvent(event).prepare();
    log.debug("Sending game event to server: ", gameEvent)
    
    api.postEvent(encodeEvent(gameEvent), path)
      .then((body) => {
        log.debug(body)
        let eventSummary = body.summary
        let awards = body.awards
        let publish = body.publish
        log.debug("Event saved:", eventSummary)
        discord.send(eventSummary, publish)
          .catch((err) => {
            log.error("Couldn't send to discord: " + err)
          })
          .finally(() => {
            awards.forEach((award) => {
              let awardMessage = `:military_medal: ${award.pilot} has been awarded the "${award.badge.title}" badge!`
              log.info(awardMessage)
              discord.send(awardMessage)
                .catch((err) => {
                  log.error("Couldn't send award to discord: " + err)
                })
            })
          })
      })
      .catch((err) => {
        log.error("Failed to save event: " + err)
      })
  } else {
    log.error("Invalid event type: " + event.type);
  }
}

function encodeEvent(event) {
  return new TextEncoder().encode(
    JSON.stringify(event)
  )
}
