const { DiscordClient } = require('./clients/discordClient');
const UDPServer = require('./services/udpServer');
const { EventProcessor } = require('./services/eventProcessor');
const { EventFactory } = require('./factories/eventFactory');
const { APIClient } = require('./clients/apiClient');


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
      .then(async (response) => {
        log.info(`API response: ${JSON.stringify(response)}`);
          const publish = response?.publish !== false;
          const messages = [];
          if (response?.summary) messages.push(response.summary);
          const awards = Array.isArray(response?.awards) ? response.awards : [];
          for (const award of awards) {
            if (award?.message) messages.push(award.message);
          }
          log.info(`Discord messages to send: ${JSON.stringify(messages)}`);

          let promise = Promise.resolve();
          messages.forEach((msg, i) => {
            promise = promise.then(() => {
              log.info(`About to send Discord message #${i + 1}/${messages.length}: ${msg}`);
              return discordClient.send(msg, publish)
                .then(() => log.info(`Successfully sent Discord message #${i + 1}`))
                .catch((error) => log.error(`Error sending Discord message #${i + 1}:`, error));
            });
          });
      })
      .catch(error => log.error(error))
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

  return { udpServer, apiClient, discordClient, eventProcessor };
}

module.exports = { initApp, attachEventPipeline };
