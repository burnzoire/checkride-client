const { DiscordClient } = require('./clients/discordClient');
const { DCSChatClient, DEFAULT_DCS_CHAT_HOST } = require('./clients/dcsChatClient');
const UDPServer = require('./services/udpServer');
const GaugeSync = require('./services/gaugeSync');
const { EventProcessor } = require('./services/eventProcessor');
const AchievementEngine = require('./services/achievementEngine');
const { KillEventQueue } = require('./services/killEventQueue');
const { createTakeoffLandingQueues } = require('./services/takeoffLandingQueue');
const { WeaponTracker } = require('./services/weaponTracker');
const { EventFactory, InvalidEventTypeError } = require('./factories/eventFactory');
const { APIClient } = require('./clients/apiClient');
const { HealthChecker } = require('./services/healthChecker');
const { HeartbeatService } = require('./services/heartbeatService');
const { NewRelicClient } = require('./clients/newRelicClient');
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

function handlePilotSnapshot({ gaugeSync, sortieLogger, engine, event, unlockedAchievements }) {
  const snapshot = buildPilotSnapshot({ engine, event, unlockedAchievements });
  if (!snapshot) return;

  if (event.type !== 'flight_sample_enrichment') {
    const snapshotInAir = snapshot.state?.telemetry?.inAir ?? snapshot.state?.now?.inAir;
    log.debug(`Pilot state snapshot: pilot=${event.playerUcid} trigger=${event.type} inAir=${snapshotInAir}`);
  }

  if (gaugeSync && typeof gaugeSync.syncSnapshot === 'function') {
    gaugeSync.syncSnapshot(snapshot);
  }

  if (sortieLogger && event.type === 'flight_sample_enrichment' && event.playerUcid) {
    sortieLogger.logSnapshot(event.playerUcid, snapshot);
  }
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

function buildBaseUrl(useSsl, host, port) {
  const scheme = useSsl ? 'https' : 'http';
  const portNum = parseInt(port, 10);
  const isDefaultPort = (useSsl && portNum === 443) || (!useSsl && portNum === 80);
  const portSuffix = isDefaultPort || !portNum ? '' : `:${portNum}`;
  return `${scheme}://${host}${portSuffix}`;
}

function attachEventPipeline({ udpServer, apiClient, discordClient, dcsChatClient, gaugeSync, sortieLogger, eventProcessor, achievementEngine, weaponTracker, onLuaVersionMismatch, newRelicClient, pilotProgressionUrl }) {
  const processor = eventProcessor || new EventProcessor();
  const engine = achievementEngine || new AchievementEngine();
  const warnedMismatchKeys = new Set();
  const welcomedUcids = new Set();
  // Tracks each player's in-flight shots (from `shot_enrichment`) so a kill can be
  // attributed to the exact weapon that hit — a key-match, not a guess. This is the
  // client-authoritative source of truth for kill weapons.
  const tracker = weaponTracker || new WeaponTracker();
  // Queues persisted kills until their mission `kill_enrichment` (separate,
  // unordered, persist=false) arrives so its DCS-sourced weapon/victim taxonomy
  // can be folded on; releases on arrival or after a short deadline. At the
  // rendezvous it asks `weaponTracker` to attribute the weapon (overriding the
  // mission script's kill-time getDesc(), which is unreliable for guns/clusters).
  const killEventQueue = new KillEventQueue({
    missionScriptingEnabled: () => store.get('mission_scripting_enabled') !== false,
    resolveWeapon: ({ killerUcid, victimObjectId, weaponName, victimPositionX, victimPositionY }) => {
      // Match the kill to a tracked shot (by name when ids/hit-links are absent, which
      // is the norm). Marks the shot 'killed' for the telemetry view, supplies the
      // launch-captured desc_raw (also fixes the first-kill missing desc), and — from the
      // victim's death position — computes the launch→death engagement range.
      const match = tracker.matchKill({ killerUcid, victimObjectId, weaponName, victimPositionX, victimPositionY });
      if (match && match.descRaw != null) {
        return { desc_raw: match.descRaw };
      }
      // The kill's own shot wasn't matched with a descriptor — long BVR flights get
      // pruned before the kill lands, and lethal hits often expose no weapon to read.
      // getDesc() is static per type, so recover it by the kill's (reliable) weapon name
      // from any prior launch of that type this session.
      if (weaponName) {
        const descRaw = tracker.descForWeaponName(weaponName);
        if (descRaw != null) return { desc_raw: descRaw };
      }
      // No named weapon / no tracked shot — likely a gun or cluster kill (GameGUI
      // reports those weaponless). Decide guns only when unambiguous.
      const gun = tracker.matchGunKill({ killerUcid });
      if (gun && gun.weaponName != null) {
        return { weapon_name: gun.weaponName, attribution: 'gun' };
      }
      return null;
    },
  });
  // Same rendezvous for takeoff/landing: hold the persisted GameGUI event until its
  // mission enrichment lands, folding the DCS Airbase.Category (airdrome/FARP/ship) the
  // GameGUI environment can't read onto event.metadata.
  const { takeoffQueue, landingQueue } = createTakeoffLandingQueues({
    missionScriptingEnabled: () => store.get('mission_scripting_enabled') !== false,
  });
  // Built from connect/change_slot events so mission-script events with null playerUcid
  // (due to the async CheckridePlayers injection race) can still be attributed correctly.
  const ucidByName = new Map();
  // Rate-limit UCID-missing NR logs to first occurrence per player name per session.
  const reportedMissingUcidKeys = new Set();
  udpServer.onEvent = (event) => {
    if (event.playerUcid && event.playerName) {
      ucidByName.set(event.playerName, event.playerUcid);
    } else if (!event.playerUcid && event.playerName) {
      const resolvedUcid = ucidByName.get(event.playerName);
      if (resolvedUcid) {
        event.playerUcid = resolvedUcid;
      }
    }

    if (!event.playerUcid && event.killerUcid) {
      event.playerUcid = event.killerUcid;
      event.playerName = event.killerName;
    }

    if (event.type === 'kill_enrichment') {
      killEventQueue.recordEnrichment(event);
    }
    if (event.type === 'takeoff_enrichment') {
      takeoffQueue.recordEnrichment(event);
    }
    if (event.type === 'landing_enrichment') {
      landingQueue.recordEnrichment(event);
    }

    // Feed the shot tracker so kills can be key-matched to the weapon that hit.
    if (event.type === 'shot_enrichment') {
      tracker.recordShot(event);
    }
    if (event.type === 'weapon_sample_enrichment') {
      tracker.recordSample(event);
    }
    if (event.type === 'hit_enrichment') {
      tracker.recordHit({
        playerUcid: event.playerUcid,
        weaponObjectId: event.weaponObjectId,
        targetObjectId: event.targetObjectId,
        distanceNm: event.distanceNm,
        weaponName: event.weaponName,
      });
    }
    if (event.type === 'gun_burst_start' || event.type === 'gun_burst_end') {
      tracker.recordGunBurst(event);
    }

    if (event.type === 'flight_sample_enrichment' && !event.playerUcid && newRelicClient) {
      const missingKey = event.playerName || '__no_name__';
      if (!reportedMissingUcidKeys.has(missingKey)) {
        reportedMissingUcidKeys.add(missingKey);
        newRelicClient.recordLog('flight_sample_enrichment missing ucid', {
          logType: 'ucid_missing_flight_sample',
          clientVersion: CLIENT_VERSION,
          playerName: event.playerName || null,
          source: event.source || null,
          ucidMapSize: ucidByName.size,
        });
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

    if (sortieLogger && event.playerUcid && ['land', 'crash', 'disconnect'].includes(event.type)) {
      sortieLogger.endSortie(event.playerUcid, event.type);
    }

    if (shouldRefreshPilotSession(event)) {
      if (event.type === 'connect') {
        welcomedUcids.delete(event.playerUcid);
      }

      if (sortieLogger && event.playerUcid) {
        sortieLogger.startSortie(event.playerUcid, event.playerName);
      }

      engine.resetPilot(event.playerUcid);
      engine.loadAchievementsFromApi(event.playerUcid, apiClient)
        .catch((error) => log.error(`Failed to load achievements for pilot ${event.playerUcid}:`, error))

      if (event.type === 'change_slot' && event.flyable && dcsChatClient?.send && !welcomedUcids.has(event.playerUcid)) {
        welcomedUcids.add(event.playerUcid);
        const url = pilotProgressionUrl || 'https://checkride.oversweep.com';
        dcsChatClient.send(
          `You can view your pilot progression any time at ${url}`,
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
      handlePilotSnapshot({ gaugeSync, sortieLogger, engine, event, unlockedAchievements: newlyUnlocked });
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
              dcsChatClient.send(msg, true, { kind: 'achievement', playerUcid: event.playerUcid, outText: achievement.personalMessage() })
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

    // Persisted kills are queued rather than sent inline: the mission script's
    // DCS-sourced weapon/victim taxonomy arrives separately (persist=false
    // kill_enrichment), so the queue holds the kill until that lands — folding it
    // onto event.metadata — or releases it after a short deadline if none comes.
    // `kill` drives no achievement evaluation (no dispatch entry), so deferring
    // only delays the API save + summary, nothing else.
    const runPipeline = () => EventFactory.create(event)
      .then(gameEvent => {
        const preparedPayload = gameEvent.prepare();
        if (!preparedPayload) {
          log.debug(`Skipping event with empty prepared payload: ${event.type}`);
          unlockedAchievements = engine.evaluate(event);
          handlePilotSnapshot({ gaugeSync, sortieLogger, engine, event, unlockedAchievements });
          return null;
        }

        unlockedAchievements = engine.evaluate(event);
        handlePilotSnapshot({ gaugeSync, sortieLogger, engine, event, unlockedAchievements });

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
                const proficiencyOutText = proficiency.name ? `[✓] ${proficiency.name}` : null;
                dcsChatClient.send(proficiency.message, publish, { kind: 'proficiency', playerUcid: event.playerUcid, outText: proficiencyOutText })
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
                dcsChatClient.send(msg, publish, { kind: 'achievement', playerUcid: event.playerUcid, outText: achievement.personalMessage() })
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

    if (event.type === 'kill') {
      return killEventQueue.submitKill(event, runPipeline);
    }
    if (event.type === 'takeoff') {
      return takeoffQueue.submit(event, runPipeline);
    }
    if (event.type === 'landing') {
      return landingQueue.submit(event, runPipeline);
    }
    return runPipeline();
  }
}

async function initApp({ onLuaVersionMismatch, sortieLogger } = {}) {
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
  const weaponTracker = new WeaponTracker()
  const gaugeSync = new GaugeSync(apiClient)

  const newRelicClient = new NewRelicClient(process.env.NEW_RELIC_LICENSE_KEY);

  newRelicClient.recordLog('checkride-client started', {
    logType: 'startup',
    clientVersion: CLIENT_VERSION,
    apiPort,
    usesSsl: useSsl,
  });

  const pilotProgressionUrl = `${useSsl ? 'https' : 'http'}://${apiHost}`;
  attachEventPipeline({ udpServer, apiClient, discordClient, dcsChatClient, gaugeSync, sortieLogger, eventProcessor, achievementEngine, weaponTracker, onLuaVersionMismatch, newRelicClient, pilotProgressionUrl })

  const healthChecker = new HealthChecker(apiClient, store, undefined, (healthy) => {
    newRelicClient.recordLog('api health state changed', {
      logType: 'health_change',
      clientVersion: CLIENT_VERSION,
      healthy,
    });
  })
  healthChecker.start()

  let connectedPlayerCount = 0;
  const originalOnEvent = udpServer.onEvent;
  udpServer.onEvent = (event) => {
    if (event.playerCount != null) connectedPlayerCount = event.playerCount;
    return originalOnEvent(event);
  };

  const heartbeatService = new HeartbeatService(apiClient, undefined, () => connectedPlayerCount, newRelicClient)
  heartbeatService.start()

  return { udpServer, apiClient, discordClient, dcsChatClient, gaugeSync, eventProcessor, achievementEngine, weaponTracker, healthChecker, heartbeatService };
}

module.exports = { initApp, attachEventPipeline, buildBaseUrl };
