const { DiscordClient } = require('./clients/discordClient');
const { DCSChatClient, DEFAULT_DCS_CHAT_HOST } = require('./clients/dcsChatClient');
const UDPServer = require('./services/udpServer');
const { EventProcessor } = require('./services/eventProcessor');
const AchievementEngine = require('./services/achievementEngine');
const { EventFactory, InvalidEventTypeError } = require('./factories/eventFactory');
const { APIClient } = require('./clients/apiClient');
const { HealthChecker } = require('./services/healthChecker');
const { version: CLIENT_VERSION } = require('./package.json');


const log = require('electron-log');
const store = require('./config');

const DEFAULT_UDP_PORT = 41234;
const DEFAULT_DCS_CHAT_UDP_PORT = 41235;
// Emoji enrichment utility for Discord summaries
const EVENT_EMOJIS = {
  kill: ':dart: ',
  takeoff: ':airplane_departure: ',
  landing: ':airplane_arriving: ',
  connect: ':link: ',
  disconnect: ':broken_chain: ',
  change_slot: ':repeat: ',
  crash: ':skull: ',
  eject: ':parachute: ',
  self_kill: ':eight_pointed_black_star: ',
  pilot_death: ':headstone: ',
  achievement: ':white_check_mark: ',
  proficiency: ':white_check_mark: ',
};

function enrichWithEmojis(summary, eventType) {
  const emoji = EVENT_EMOJIS[eventType];
  return emoji ? emoji + summary : summary;
}

function isNewAchievementSaveResult(result) {
  if (!result || typeof result !== 'object') return true;
  return result.created !== false;
}

function sendMissionScriptingConfig(dcsChatClient, missionScriptingEnabled, source) {
  if (!dcsChatClient?.sendConfig) {
    log.warn(`Skipping mission scripting config (${source}): DCS chat client is unavailable`)
    return Promise.resolve()
  }

  log.info(`Sending mission scripting config on ${source}: mission_scripting_enabled=${missionScriptingEnabled}`)
  return dcsChatClient.sendConfig({ mission_scripting_enabled: missionScriptingEnabled })
    .catch((error) => log.error(`Error sending mission scripting config on ${source}:`, error))
}

function publishPilotStateUpdate({ apiClient, engine, event, unlockedAchievements }) {
  if (!event?.playerUcid) return;
  if (!engine || typeof engine.buildSnapshot !== 'function') return;

  const snapshot = engine.buildSnapshot({
    pilotUcid: event.playerUcid,
    triggerEvent: event,
    unlockedAchievements,
  });

  if (!snapshot) return;

  log.debug(`Pilot state snapshot: pilot=${event.playerUcid} trigger=${event.type} inAir=${snapshot.state?.now?.inAir}`);

  apiClient.publishPilotState(snapshot)
    .catch((error) => log.error(`Failed to publish pilot state for ${event.playerUcid}:`, error));
}

function attachEventPipeline({ udpServer, apiClient, discordClient, dcsChatClient, eventProcessor, achievementEngine }) {
  const processor = eventProcessor || new EventProcessor();
  const engine = achievementEngine || new AchievementEngine();
  udpServer.onEvent = (event) => {
    log.info(`Handling event: ${JSON.stringify(event)}`)

    if (event.type === 'ready') {
      log.info('GameGUI ready signal received, sending config')
      const missionScriptingEnabled = store.get('mission_scripting_enabled')
      return sendMissionScriptingConfig(dcsChatClient, missionScriptingEnabled, 'ready')
    }

    if (event.type === 'connect' && event.playerUcid) {
      engine.resetPilot(event.playerUcid);
      engine.loadAchievementsFromApi(event.playerUcid, apiClient)
        .catch((error) => log.error(`Failed to load achievements for pilot ${event.playerUcid}:`, error))
    }

    // Events with persist: false update pilot state and fire achievements but are never saved to the API.
    if (event.persist === false) {
      log.info(`State-only event (persist=false): ${JSON.stringify(event)}`)
      const newlyUnlocked = engine.evaluate(event);
      publishPilotStateUpdate({ apiClient, engine, event, unlockedAchievements: newlyUnlocked });
      let last = Promise.resolve();
      newlyUnlocked.forEach((achievement, i) => {
        const pilotName = event.playerName || 'Unknown Pilot';
        const msg = achievement.message(pilotName);

        last = last.then(() => apiClient.saveAchievement({
          playerUcid: event.playerUcid,
          achievementId: achievement.id,
          earnedAt: new Date().toISOString(),
        }))
          .then((result) => {
            if (!isNewAchievementSaveResult(result)) return;

            if (dcsChatClient?.send) {
              dcsChatClient.send(msg, true, { kind: 'achievement' })
                .catch((error) => log.error(`Error sending DCS chat achievement #${i + 1}:`, error));
            }

            return discordClient.send(enrichWithEmojis(msg, 'achievement'), true)
              .catch((error) => log.error(`Error sending Discord achievement #${i + 1}:`, error));
          })
          .catch((error) => log.error(`Failed to persist achievement ${achievement.id}:`, error));
      });
      return last;
    }

    let unlockedAchievements = [];

    return EventFactory.create(event)
      .then(gameEvent => {
        const preparedPayload = gameEvent.prepare();
        if (!preparedPayload) {
          log.debug(`Skipping event with empty prepared payload: ${event.type}`);
          unlockedAchievements = engine.evaluate(event);
          publishPilotStateUpdate({ apiClient, engine, event, unlockedAchievements });
          return null;
        }

        unlockedAchievements = engine.evaluate(event);
        publishPilotStateUpdate({ apiClient, engine, event, unlockedAchievements });
        const processedPayload = processor.process(event, preparedPayload);
        return apiClient.saveEvent(processedPayload);
      })
      .then((response) => {
        if (!response) {
          return;
        }

        log.info(`API response: ${JSON.stringify(response)}`);
        const publish = response?.publish !== false;
        const proficiencies = Array.isArray(response?.proficiencies) ? response.proficiencies : [];

        let last = Promise.resolve();

        if (response?.summary) {
          const summaryMsg = enrichWithEmojis(response.summary, response.event_type);
          log.info(`About to send Discord summary: ${summaryMsg}`);
          last = discordClient.send(summaryMsg, publish)
            .then(() => {
              log.info('Successfully sent Discord summary');
            })
            .catch((error) => log.error('Error sending Discord summary:', error));

          proficiencies.forEach((proficiency, i) => {
            if (proficiency?.message) {
              if (dcsChatClient?.send) {
                dcsChatClient.send(proficiency.message, publish, { kind: 'proficiency' })
                  .catch((error) => log.error(`Error sending DCS chat proficiency #${i + 1}:`, error));
              }

              last = last.then(() => {
                const proficiencyMsg = enrichWithEmojis(proficiency.message, 'proficiency');
                log.info(`About to send Discord proficiency #${i + 1}: ${proficiencyMsg}`);
                return discordClient.send(proficiencyMsg, publish)
                  .then(() => log.info(`Successfully sent Discord proficiency #${i + 1}`))
                  .catch((error) => log.error(`Error sending Discord proficiency #${i + 1}:`, error));
              });
            }
          });
        }

        unlockedAchievements.forEach((achievement, i) => {
          const pilotName = event.playerName || 'Unknown Pilot';
          const msg = achievement.message(pilotName);

          last = last.then(() => apiClient.saveAchievement({
            playerUcid: event.playerUcid,
            achievementId: achievement.id,
            earnedAt: new Date().toISOString(),
          }))
            .then((result) => {
              if (!isNewAchievementSaveResult(result)) return;

              if (dcsChatClient?.send) {
                dcsChatClient.send(msg, publish, { kind: 'achievement' })
                  .catch((error) => log.error(`Error sending DCS chat achievement #${i + 1}:`, error));
              }

              const achievementMsg = enrichWithEmojis(msg, 'achievement');
              log.info(`About to send Discord achievement #${i + 1}: ${achievementMsg}`);
              return discordClient.send(achievementMsg, publish)
                .then(() => log.info(`Successfully sent Discord achievement #${i + 1}`))
                .catch((error) => log.error(`Error sending Discord achievement #${i + 1}:`, error));
            })
            .catch((error) => log.error(`Failed to persist achievement ${achievement.id}:`, error));
        });

        return last;
      })
      .catch(error => {
        if (error instanceof InvalidEventTypeError) {
          log.debug(`Skipping unknown event type: ${event.type}`);
          return;
        }
        log.error(error);
      });
  }
}

async function initApp() {
  const useSsl = store.get("use_ssl")
  const apiHost = store.get("server_host")
  const apiPort = store.get("server_port")
  const apiToken = store.get("api_token")
  const pathPrefix = store.get("path_prefix")
  const discordWebhookPath = store.get("discord_webhook_path")
  const apiClient = new APIClient(useSsl, apiHost, apiPort, apiToken, pathPrefix, CLIENT_VERSION)
  const discordClient = new DiscordClient(discordWebhookPath)
  const dcsChatClient = new DCSChatClient({
    host: DEFAULT_DCS_CHAT_HOST,
    port: DEFAULT_DCS_CHAT_UDP_PORT,
  })
  const udpServer = new UDPServer(DEFAULT_UDP_PORT)

  const missionScriptingEnabled = store.get('mission_scripting_enabled')
  sendMissionScriptingConfig(dcsChatClient, missionScriptingEnabled, 'startup')

  const eventProcessor = new EventProcessor()
  const achievementEngine = new AchievementEngine()

  attachEventPipeline({ udpServer, apiClient, discordClient, dcsChatClient, eventProcessor, achievementEngine })

  // Initialize and start health checker
  const healthChecker = new HealthChecker(apiClient, store)
  healthChecker.start()

  return { udpServer, apiClient, discordClient, dcsChatClient, eventProcessor, achievementEngine, healthChecker };
}

module.exports = { initApp, attachEventPipeline };
