import { BrowserWindow, Menu, Tray, app, globalShortcut } from 'electron';
import log from 'electron-log';
import path from 'path';
import APIClient from './apiClient';
import store from './config';
import { contextMenuTemplate } from './contextMenuTemplate'; // we'll create this new file 
import DiscordClient from './discord';
import UDPServer from './udpServer';
import { time } from 'console';


function createWindow() {
  const win = new BrowserWindow({
    width: 800,
    height: 600,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js')
    }
  })
  win.loadFile('index.html')
}

// Set up electron-log hooks - do we need this?
// log.hooks.push((msg) => {
//   let currentDate = new Date().toISOString();
//   // Convert the first item to a string and prepend the timestamp
//   if (typeof msg.data[0] === 'string') {
//     msg.data[0] = `[${currentDate}] ${msg.data[0]}`;
//   }

//   return msg;
// });


let tray = null
app.whenReady().then(() => {
  const udpPort = store.get('udp_port', 41234)
  const useSsl = store.get("use_ssl")
  const apiHost = store.get("server_host")
  const apiPort = store.get("server_port")
  const discordWebhookPath = store.get("discord_webhook_path")

  const api = new APIClient(useSsl, apiHost, apiPort)
  const discord = new DiscordClient(discordWebhookPath)
  const udpServer = new UDPServer(udpPort, api, discord)
  const contextMenu = Menu.buildFromTemplate(contextMenuTemplate(udpServer, api))
  
  if (app.dock) { app.dock.hide() }
  
  tray = new Tray(path.join(__dirname, './assets/icon.png'))
  tray.setToolTip('Quoll')
  tray.setContextMenu(contextMenu)

  globalShortcut.register('CommandOrControl+Q', () => {
    app.quit()
  })
})

app.on('window-all-closed', function () {
  if (process.platform !== 'darwin') app.quit()
})
