const { Menu, Tray, app, globalShortcut } = require('electron');
const log = require('electron-log');
const path = require('path');
const { APIClient } = require('./clients/apiClient');
const store = require('./config');
const contextMenuTemplate = require('./tray/contextMenuTemplate');
const { DiscordClient } = require('./clients/discordClient');
const UDPServer = require('./services/udpServer');
const { EventFactory } = require('./factories/eventFactory');

let tray = null
app.whenReady().then(() => {
  const udpPort = store.get('udp_port', 41234)
  const useSsl = store.get("use_ssl")
  const apiHost = store.get("server_host")
  const apiPort = store.get("server_port")
  const discordWebhookPath = store.get("discord_webhook_path")

  const apiClient = new APIClient(useSsl, apiHost, apiPort)
  const discordClient = new DiscordClient(discordWebhookPath)
  const udpServer = new UDPServer(udpPort)
  const contextMenu = Menu.buildFromTemplate(contextMenuTemplate(udpServer, apiClient))

  udpServer.onEvent = (event) => {
    log.info(`Handling event: ${JSON.stringify(event)}`);
    return EventFactory.create(event)
      .then(gameEvent => apiClient.saveEvent(gameEvent))
      .then(response => discordClient.send(response.summary, response.publish))
      .catch(error => log.error(error))
  }

  if (app.dock) {
    app.dock.hide()
  }

  tray = new Tray(path.join(__dirname, './assets/icon.png'))
  tray.setToolTip('Quoll')
  tray.setContextMenu(contextMenu)

  globalShortcut.register('CommandOrControl+Q', () => {
    app.quit()
  })
})

app.on('window-all-closed', function () {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
