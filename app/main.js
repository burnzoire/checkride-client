const { Menu, Tray, app, globalShortcut } = require('electron');
const path = require('path');
const contextMenuTemplate = require('./tray/contextMenuTemplate');
const { initApp } = require('./appInit');

var tray = null
const iconPath = path.join(__dirname, './assets/icon.png');

app.whenReady().then(async () => {
  const { udpServer, apiClient } = await initApp();
  const contextMenu = Menu.buildFromTemplate(contextMenuTemplate(udpServer, apiClient))
  tray = new Tray(iconPath)

  if (app.dock) {
    app.dock.hide()
  }

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

module.exports = { initApp };
