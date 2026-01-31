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
  check_item: ':military_medal: ',
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
        return apiClient.saveEvent(processedPayload);
      })
      .then((response) => {
        log.info(`API response: ${JSON.stringify(response)}`);
        const publish = response?.publish !== false;
        const checkItems = Array.isArray(response?.check_items) ? response.check_items : [];
        if (!response?.summary) return;
        log.info(`About to send Discord summary: ${response.summary}`);
        let last = discordClient.send(response.summary, publish)
          .then(() => {
            log.info('Successfully sent Discord summary');
          })
          .catch((error) => log.error('Error sending Discord summary:', error));

        checkItems.forEach((checkItem, i) => {
          if (checkItem?.message) {
            last = last.then(() => {
              const checkItemMsg = enrichWithEmojis(checkItem.message, 'check_item');
              log.info(`About to send Discord check item #${i + 1}: ${checkItemMsg}`);
              return discordClient.send(checkItemMsg, publish)
                .then(() => log.info(`Successfully sent Discord check item #${i + 1}`))
                .catch((error) => log.error(`Error sending Discord check item #${i + 1}:`, error));
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
