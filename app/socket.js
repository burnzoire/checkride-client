import dgram from 'dgram'
import path from 'path'
import { app, Menu, Tray, BrowserWindow, globalShortcut } from 'electron'

function createWindow () {
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
  // createWindow()
  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
  tray = new Tray('./assets/icon.png')
  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'About Quoll',
      role: 'about',
    },
    { type: 'separator' },
    {
      label: 'Quit Quoll',
      role: 'quit',
      accelerator:'CommandOrControl+Q',
    },
  ])
  tray.setToolTip('Quoll')
  tray.setContextMenu(contextMenu)

  globalShortcut.register('CommandOrControl+Q', () => {
    app.quit()
  })

})

app.on('window-all-closed', function () {
  if (process.platform !== 'darwin') app.quit()
})

const server = dgram.createSocket('udp4');

server.on('error', (err) => {
  console.log(`server error:\n${err.stack}`);
  server.close();
});

server.on('message', (msg, rinfo) => {
  console.log(`server got: ${msg} from ${rinfo.address}:${rinfo.port}`);
});

server.on('listening', () => {
  const address = server.address();
  console.log(`server listening ${address.address}:${address.port}`);
});

server.bind(41234);
// Prints: server listening 0.0.0.0:41234