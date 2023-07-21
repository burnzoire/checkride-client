import log from 'electron-log'
import APIClient from './apiClient'
import sendToDiscord from './discord'

export default function handleEvent(msg) {
  const api = new APIClient();

  let event = JSON.parse(msg)
  let payload = "{}"
  let gameEvent = {}
  const path = "/events"
  log.debug("Event type: " + event.type)
  switch (event.type) {
    case "kill":
      log.debug(`killer ucid: ${event.killerUcid} killer name: ${event.killerName}, killer unit: ${event.killerUnitType}, victim ucid: ${event.victimUcid}  victim name: ${event.victimName}, victim unit: ${event.victimUnitType}, weapon: ${event.weaponName}`)
      gameEvent = {
        event_type: event.type,
        event: {
          killer_ucid: event.killerUcid,
          killer_name: event.killerName,
          killer_unit_name: event.killerUnitType,
          killer_unit_category: event.killerUnitCategory,
          victim_ucid: event.victimUcid,
          victim_name: event.victimName,
          victim_unit_name: event.victimUnitType,
          victim_unit_category: event.victimUnitCategory,
          weapon_name: event.weaponName
        }
      }
      break;
    case "takeoff":
    case "landing":
      log.debug(`${event.type}: player ucid: ${event.playerUcid} unitType: ${event.unitType} airdromeName: ${event.airdromeName}`)
      gameEvent = {
        event_type: event.type,
        event: {
          player_ucid: event.playerUcid,
          player_name: event.playerName,
          unit_type: event.unitType,
          unit_category: event.unitCategory,
          airdrome_name: event.airdromeName
        }
      }
      break;
    case "crash":
    case "eject":
    case "pilot_death":
      log.debug(`${event.type}: player ucid: ${event.playerUcid} unitType: ${event.unitType}`)
      gameEvent = {
        event_type: event.type,
        event: {
          player_ucid: event.playerUcid,
          player_name: event.playerName,
          unit_type: event.unitType,
          unit_category: event.unitCategory
        }
      }
      break;
    case "self_kill":
      log.debug(`${event.type}: player ucid: ${event.playerUcid}`)
      gameEvent = {
        event_type: event.type,
        event: {
          player_ucid: event.playerUcid,
          player_name: event.playerName
        }
      }
      break;
    case "connect":
      log.debug(`${event.type}: ${event.playerName} connected`)
      gameEvent = {
        event_type: event.type,
        event: {
          player_ucid: event.playerUcid,
          player_name: event.playerName
        }
      }
      break;
    case "disconnect":
      log.debug(`${event.type}: ${event.playerName} disconnected`)
      gameEvent = {
        event_type: event.type,
        event: {
          player_ucid: event.playerUcid,
          player_name: event.playerName,
          player_side: event.playerSide,
          reason_code: event.reasonCode
        }
      }
      break;
    case "change_slot":
      log.debug(`${event.type}: ${event.playerName} selected slot ${event.slotId}`)
      gameEvent = {
        event_type: event.type,
        event: {
          player_ucid: event.playerUcid,
          player_name: event.playerName,
          slot_id: event.slotId,
          prev_side: event.prevSide
        }
      }
      break;
  }
  log.debug("Sending game event to server: ", gameEvent)
  payload = new TextEncoder().encode(
    JSON.stringify(gameEvent)
  )
  api.postEvent(payload, path)
    .then((body) => {
      log.debug(body)
      let eventSummary = body.summary
      let awards = body.awards
      let publish = body.publish
      log.debug("Event saved:", eventSummary)
      sendToDiscord(eventSummary, publish)
        .catch((err) => {
          log.error("Couldn't send to discord: " + err)
        })
        .finally(() => {
          awards.forEach((award) => {
            let awardMessage = `:military_medal: ${award.pilot} has been awarded the "${award.badge.title}" badge!`
            log.info(awardMessage)
            sendToDiscord(awardMessage)
              .catch((err) => {
                log.error("Couldn't send award to discord: " + err)
              })
          })
        })
    })
    .catch((err) => {
      log.error("Failed to save event: " + err)
    })
}