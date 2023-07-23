import { BrowserWindow, Menu, Tray, app, globalShortcut } from 'electron'
import UDPServer from './udpServer'
import APIClient from './apiClient'
import discord from './discord'
import path from 'path'
import { contextMenuTemplate } from './contextMenuTemplate' // we'll create this new file 


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

let tray = null
app.whenReady().then(() => {
  if (app.dock) { app.dock.hide() }
  
  tray = new Tray(path.join(__dirname, './assets/icon.png'))

  const api = new APIClient();
  const udpServer = new UDPServer(api, discord);
  const contextMenu = Menu.buildFromTemplate(contextMenuTemplate(udpServer, api))
  tray.setToolTip('Quoll')
  tray.setContextMenu(contextMenu)

  globalShortcut.register('CommandOrControl+Q', () => {
    app.quit()
  })
})

app.on('window-all-closed', function () {
  if (process.platform !== 'darwin') app.quit()
})
