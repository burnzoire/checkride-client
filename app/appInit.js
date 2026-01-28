const { DiscordClient } = require('./clients/discordClient');
const UDPServer = require('./services/udpServer');
const { EventProcessor } = require('./services/eventProcessor');
const { EventFactory } = require('./factories/eventFactory');
const { APIClient } = require('./clients/apiClient');
const { HealthChecker } = require('./services/healthChecker');


const log = require('electron-log');
const store = require('./config');

const DEFAULT_UDP_PORT = 41234;

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
        const awards = Array.isArray(response?.awards) ? response.awards : [];
        if (!response?.summary) return;
        log.info(`About to send Discord summary: ${response.summary}`);
        let last = discordClient.send(response.summary, publish)
          .then(() => {
            log.info('Successfully sent Discord summary');
          })
          .catch((error) => log.error('Error sending Discord summary:', error));

        awards.forEach((award, i) => {
          if (award?.message) {
            last = last.then(() => {
              log.info(`About to send Discord award #${i + 1}: ${award.message}`);
              return discordClient.send(award.message, publish)
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
