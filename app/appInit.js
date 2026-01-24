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
      .then(response => {
        const publish = response?.publish !== false;
        return discordClient.send(response?.summary, publish);
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
