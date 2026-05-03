const { DiscordClient } = require('./clients/discordClient');
const { DCSChatClient, DEFAULT_DCS_CHAT_HOST } = require('./clients/dcsChatClient');
const UDPServer = require('./services/udpServer');
const PilotStatePublisher = require('./services/pilotStatePublisher');
const GaugeSync = require('./services/gaugeSync');
const { EventProcessor } = require('./services/eventProcessor');
const AchievementEngine = require('./services/achievementEngine');
const { EventFactory, InvalidEventTypeError } = require('./factories/eventFactory');
const { APIClient } = require('./clients/apiClient');
const { HealthChecker } = require('./services/healthChecker');
const { HeartbeatService } = require('./services/heartbeatService');
const { version: CLIENT_VERSION } = require('./package.json');


const log = require('electron-log');
const store = require('./config');

const DEFAULT_UDP_PORT = 41234;
const DEFAULT_DCS_CHAT_UDP_PORT = 41235;
const PILOT_STATE_SAMPLE_PUBLISH_MIN_INTERVAL_MS = 5000;
const PILOT_STATE_THROTTLED_EVENT_TYPES = new Set([
  'flight_sample_enrichment',
  'weapon_sample_enrichment',
]);
// Emoji enrichment utility for Discord summaries
const EVENT_EMOJIS = {
  kill: ':dart: ',
  takeoff: ':airplane_departure: ',
  landing: ':airplane_arriving: ',
  aar: ':fuelpump: ',
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

function buildPilotSnapshot({ engine, event, unlockedAchievements }) {
  if (!event?.playerUcid) return;
  if (!engine || typeof engine.buildSnapshot !== 'function') return;

  const snapshot = engine.buildSnapshot({
    pilotUcid: event.playerUcid,
    triggerEvent: event,
    unlockedAchievements,
  });

  if (!snapshot) return;

  return snapshot;
}

function handlePilotSnapshot({ pilotStatePublisher, gaugeSync, engine, event, unlockedAchievements, publishToCable = true }) {
  const snapshot = buildPilotSnapshot({ engine, event, unlockedAchievements });
  if (!snapshot) return;

  if (event.type !== 'flight_sample_enrichment') {
    const snapshotInAir = snapshot.state?.telemetry?.inAir ?? snapshot.state?.now?.inAir;
    log.debug(`Pilot state snapshot: pilot=${event.playerUcid} trigger=${event.type} inAir=${snapshotInAir}`);
  }

  if (event.type === 'shot_enrichment') {
    log.info(`Publishing shot pilot state snapshot: ${JSON.stringify(snapshot)}`);
  }

  if (gaugeSync && typeof gaugeSync.syncSnapshot === 'function') {
    gaugeSync.syncSnapshot(snapshot);
  }

  if (!publishToCable) return;
  if (!pilotStatePublisher || typeof pilotStatePublisher.publish !== 'function') return;

  pilotStatePublisher.publish(snapshot)
    .catch((error) => log.error(`Failed to publish pilot state for ${event.playerUcid}:`, error));
}

function shouldPublishPilotStateUpdate(event, publishStateByPilotAndType) {
  if (!event?.playerUcid || !event?.type) {
    return false;
  }

  if (!PILOT_STATE_THROTTLED_EVENT_TYPES.has(event.type)) {
    return true;
  }

  const key = `${event.playerUcid}:${event.type}`;
  const nowMs = Date.now();
  const lastPublishedAtMs = publishStateByPilotAndType.get(key) || 0;
  if ((nowMs - lastPublishedAtMs) < PILOT_STATE_SAMPLE_PUBLISH_MIN_INTERVAL_MS) {
    return false;
  }

  publishStateByPilotAndType.set(key, nowMs);
  return true;
}

function shouldRefreshPilotSession(event) {
  if (!event?.playerUcid) {
    return false;
  }

  if (event.type === 'connect') {
    return true;
  }

  return event.type === 'change_slot' && event.flyable === true;
}

function extractLuaClientVersion(event) {
  if (!event || typeof event !== 'object') return null;

  const candidates = [
    event.luaClientVersion,
    event.lua_version,
    event.clientVersion,
  ];

  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.trim() !== '') {
      return candidate.trim();
    }
  }

  return null;
}

function maybeWarnLuaVersionMismatch({ event, onLuaVersionMismatch, warnedMismatchKeys }) {
  if (typeof onLuaVersionMismatch !== 'function') {
    return Promise.resolve();
  }

  const luaClientVersion = extractLuaClientVersion(event);
  const mismatch = luaClientVersion !== CLIENT_VERSION;
  if (!mismatch) {
    return Promise.resolve();
  }

  const mismatchKey = `${luaClientVersion || 'unknown'}->${CLIENT_VERSION}`;
  if (warnedMismatchKeys.has(mismatchKey)) {
    return Promise.resolve();
  }

  warnedMismatchKeys.add(mismatchKey);
  log.warn(`Lua/client version mismatch detected: lua=${luaClientVersion || 'unknown'} client=${CLIENT_VERSION}`);

  return Promise.resolve(onLuaVersionMismatch({
    luaClientVersion,
    clientVersion: CLIENT_VERSION,
    eventType: event?.type,
  }))
    .catch((error) => log.error('Failed to handle Lua version mismatch warning:', error));
}

function attachEventPipeline({ udpServer, apiClient, discordClient, dcsChatClient, pilotStatePublisher, gaugeSync, eventProcessor, achievementEngine, publishPilotStateUpdates = true, onLuaVersionMismatch }) {
  const processor = eventProcessor || new EventProcessor();
  const engine = achievementEngine || new AchievementEngine();
  const pilotStatePublishState = new Map();
  const warnedMismatchKeys = new Set();
  // Built from connect/change_slot events so mission-script events with null playerUcid
  // (due to the async CheckridePlayers injection race) can still be attributed correctly.
  const ucidByName = new Map();
  udpServer.onEvent = (event) => {
    if (event.playerUcid === '') {
      event.playerUcid = null;
    }

    if (event.playerUcid && event.playerName) {
      ucidByName.set(event.playerName, event.playerUcid);
    } else if (!event.playerUcid && event.playerName) {
      const resolvedUcid = ucidByName.get(event.playerName);
      if (resolvedUcid) {
        event.playerUcid = resolvedUcid;
      }
    }

    if (event.type !== 'flight_sample_enrichment') {
      log.debug(`Handling event: ${JSON.stringify(event)}`)
    }

    if (event.type === 'ready') {
      log.info('GameGUI ready signal received, sending config')
      const missionScriptingEnabled = store.get('mission_scripting_enabled')
      return maybeWarnLuaVersionMismatch({ event, onLuaVersionMismatch, warnedMismatchKeys })
        .then(() => sendMissionScriptingConfig(dcsChatClient, missionScriptingEnabled, 'ready'))
    }

    if (shouldRefreshPilotSession(event)) {
      engine.resetPilot(event.playerUcid);
      engine.loadAchievementsFromApi(event.playerUcid, apiClient)
        .catch((error) => log.error(`Failed to load achievements for pilot ${event.playerUcid}:`, error))

      if (event.type === 'connect' && dcsChatClient?.send) {
        dcsChatClient.send(
          'You can view your pilot progression any time at https://checkride.oversweep.com',
          true,
          { kind: 'info', playerUcid: event.playerUcid }
        ).catch((error) => log.error(`Failed to send welcome message to ${event.playerUcid}:`, error));
      }
    }

    // Events with persist: false update pilot state and fire achievements but are never saved to the API.
    if (event.persist === false) {
      if (event.type !== 'flight_sample_enrichment') {
        log.debug(`State-only event (persist=false): ${JSON.stringify(event)}`)
      }
      const newlyUnlocked = engine.evaluate(event);
      const shouldPublishToCable = publishPilotStateUpdates && shouldPublishPilotStateUpdate(event, pilotStatePublishState);
      handlePilotSnapshot({ pilotStatePublisher, gaugeSync, engine, event, unlockedAchievements: newlyUnlocked, publishToCable: shouldPublishToCable });
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
          const shouldPublishToCable = publishPilotStateUpdates && shouldPublishPilotStateUpdate(event, pilotStatePublishState);
          handlePilotSnapshot({ pilotStatePublisher, gaugeSync, engine, event, unlockedAchievements, publishToCable: shouldPublishToCable });
          return null;
        }

        unlockedAchievements = engine.evaluate(event);
        const shouldPublishToCable = publishPilotStateUpdates && shouldPublishPilotStateUpdate(event, pilotStatePublishState);
        handlePilotSnapshot({ pilotStatePublisher, gaugeSync, engine, event, unlockedAchievements, publishToCable: shouldPublishToCable });

        if (event.persist === false) {
          if (event.type !== 'flight_sample_enrichment') {
            log.debug(`Skipping API save after evaluation (persist=false): ${JSON.stringify(event)}`);
          }
          return null;
        }

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

async function initApp({ onLuaVersionMismatch } = {}) {
  const useSsl = store.get("use_ssl")
  const apiHost = store.get("server_host")
  const apiPort = store.get("server_port")
  const apiToken = store.get("api_token")
  const pathPrefix = store.get("path_prefix")
  const serverName = store.get("server_name") || null

  log.info(`Checkride client v${CLIENT_VERSION} starting — server=${apiHost}:${apiPort} ssl=${useSsl} name=${serverName || '(none)'}`)
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
  const gaugeSync = new GaugeSync(apiClient)
  const publishPilotStateUpdates = store.get('publish_pilot_state_updates', false)
  log.info(`Pilot state websocket publishing ${publishPilotStateUpdates ? 'enabled' : 'disabled'} (publish_pilot_state_updates=${publishPilotStateUpdates})`)
  const pilotStatePublisher = new PilotStatePublisher({
    useSsl,
    host: apiHost,
    port: apiPort,
    token: apiToken,
    pathPrefix,
  })

  if (publishPilotStateUpdates) {
    pilotStatePublisher.start()
  }

  attachEventPipeline({ udpServer, apiClient, discordClient, dcsChatClient, pilotStatePublisher, gaugeSync, eventProcessor, achievementEngine, publishPilotStateUpdates, onLuaVersionMismatch })

  const healthChecker = new HealthChecker(apiClient, store)
  healthChecker.start()

  let connectedPlayerCount = 0;
  const originalOnEvent = udpServer.onEvent;
  udpServer.onEvent = (event) => {
    if (event.playerCount != null) connectedPlayerCount = event.playerCount;
    return originalOnEvent(event);
  };

  const heartbeatService = new HeartbeatService(apiClient, undefined, () => connectedPlayerCount, CLIENT_VERSION, serverName)
  heartbeatService.start()

  return { udpServer, apiClient, discordClient, dcsChatClient, pilotStatePublisher, gaugeSync, eventProcessor, achievementEngine, healthChecker, heartbeatService };
}

module.exports = { initApp, attachEventPipeline };
