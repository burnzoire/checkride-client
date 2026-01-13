const { DiscordClient } = require('./clients/discordClient');
const UDPServer = require('./services/udpServer');
const { EventFactory } = require('./factories/eventFactory');
const { APIClient } = require('./clients/apiClient');


const log = require('electron-log');
const store = require('./config');

async function initApp() {
  const udpPort = store.get('udp_port', 41234)
  const useSsl = store.get("use_ssl")
  const apiHost = store.get("server_host")
  const apiPort = store.get("server_port")
  const apiToken = store.get("api_token")
  const discordWebhookPath = store.get("discord_webhook_path")
  const apiClient = new APIClient(useSsl, apiHost, apiPort, apiToken)
  const discordClient = new DiscordClient(discordWebhookPath)
  const udpServer = new UDPServer(udpPort)

  udpServer.onEvent = (event) => {
    log.info(`Handling event: ${JSON.stringify(event)}`);
    return EventFactory.create(event)
      .then(gameEvent => apiClient.saveEvent(gameEvent.prepare()))
      .then(response => discordClient.send(response.summary, response.publish))
      .catch(error => log.error(error))
  }

  return { udpServer, apiClient };
}

module.exports = { initApp };
