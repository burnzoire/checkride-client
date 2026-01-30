const { DiscordClient } = require('./clients/discordClient');
const UDPServer = require('./services/udpServer');
const { EventProcessor } = require('./services/eventProcessor');
const { EventFactory } = require('./factories/eventFactory');
const { APIClient } = require('./clients/apiClient');
const { HealthChecker } = require('./services/healthChecker');


const log = require('electron-log');
const store = require('./config');

const DEFAULT_UDP_PORT = 41234;
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
  pilot_kill: ':headstone: ',
  award: ':military_medal: ',
};

function enrichWithEmojis(summary, eventType) {
  const emoji = EVENT_EMOJIS[eventType];
  return emoji ? emoji + summary : summary;
}

function attachEventPipeline({ udpServer, apiClient, discordClient, eventProcessor }) {
  const processor = eventProcessor || new EventProcessor();
  udpServer.onEvent = (event) => {
    log.info(`Handling event: ${JSON.stringify(event)}`)
    return EventFactory.create(event)
      .then(gameEvent => {
        const preparedPayload = gameEvent.prepare();
        const processedPayload = processor.process(event, preparedPayload);
        return apiClient.saveEvent(processedPayload).then(response => ({ response, event }));
      })
      .then(({ response, event }) => {
        log.info(`API response: ${JSON.stringify(response)}`);
        const publish = response?.publish !== false;
        const awards = Array.isArray(response?.awards) ? response.awards : [];
        if (!response?.summary) return;
        // Use event.type, fallback to event.eventType if needed
        const enrichedSummary = enrichWithEmojis(response.summary, event.type || event.eventType);
        log.info(`About to send Discord summary: ${enrichedSummary}`);
        let last = discordClient.send(enrichedSummary, publish)
          .then(() => {
            log.info('Successfully sent Discord summary');
          })
          .catch((error) => log.error('Error sending Discord summary:', error));

        awards.forEach((award, i) => {
          if (award?.message) {
            last = last.then(() => {
              const awardMsg = enrichWithEmojis(award.message, 'award');
              log.info(`About to send Discord award #${i + 1}: ${awardMsg}`);
              return discordClient.send(awardMsg, publish)
                .then(() => log.info(`Successfully sent Discord award #${i + 1}`))
                .catch((error) => log.error(`Error sending Discord award #${i + 1}:`, error));
            });
          }
        });
        return last;
      })
      .catch(error => log.error(error));
  }
}

async function initApp() {
  const useSsl = store.get("use_ssl")
  const apiHost = store.get("server_host")
  const apiPort = store.get("server_port")
  const apiToken = store.get("api_token")
  const pathPrefix = store.get("path_prefix")
  const discordWebhookPath = store.get("discord_webhook_path")
  const apiClient = new APIClient(useSsl, apiHost, apiPort, apiToken, pathPrefix)
  const discordClient = new DiscordClient(discordWebhookPath)
  const udpServer = new UDPServer(DEFAULT_UDP_PORT)

  const eventProcessor = new EventProcessor()

  attachEventPipeline({ udpServer, apiClient, discordClient, eventProcessor })

  // Initialize and start health checker
  const healthChecker = new HealthChecker(apiClient, store)
  healthChecker.start()

  return { udpServer, apiClient, discordClient, eventProcessor, healthChecker };
}

module.exports = { initApp, attachEventPipeline };
