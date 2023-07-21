import { BrowserWindow, Menu, Tray, app, globalShortcut } from 'electron'
import UDPServer from './udpServer'

import path from 'path'
import APIClient from './apiClient'

const udpServer = new UDPServer();
const api = new APIClient();

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
  // createWindow()
  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
  tray = new Tray(path.join(__dirname, './assets/icon.png'))
  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'About Quoll',
      role: 'about',
    },
    {
      label: 'Ping server',
      click() { api.ping() }
    },
    {
      label: 'Send test kill event',
      click() {
        udpServer.send(JSON.stringify({
          type: "kill",
          killerUcid: "test1",
          killerName: "Test Pilot",
          killerUnitType: "F-14A",
          killerUnitCategory: "Fixed-wing",
          victimUcid: "test2",
          victimName: "Test Pilot 2",
          victimUnitType: "JF-17",
          victimUnitCategory: "Fixed-wing",
          weaponName: "AIM-9L"
        }))
      }
    },
    {
      label: 'Send test takeoff event (F-14A)',
      click() {
        udpServer.send(JSON.stringify({
          type: "takeoff",
          playerUcid: "test1",
          playerName: "Test Pilot",
          unitType: "F-14A",
          unitCategory: "Fixed-wing",
          airdromeName: "Test Field"
        }))
      }
    },
    {
      label: 'Send test takeoff event (F-14B)',
      click() {
        udpServer.send(JSON.stringify({
          type: "takeoff",
          playerUcid: "test1",
          playerName: "Test Pilot",
          unitType: "F-14B",
          unitCategory: "Fixed-wing",
          airdromeName: "Test Field"
        }))
      }
    },
    {
      label: 'Send test landing event (F-14A)',
      click() {
        udpServer.send(JSON.stringify({
          type: "landing",
          playerUcid: "test1",
          playerName: "Test Pilot",
          unitType: "F-14A",
          unitCategory: "Fixed-wing",
          airdromeName: "Test Field"
        }))
      }
    },
    {
      label: 'Send test landing event (F-14B)',
      click() {
        udpServer.send(JSON.stringify({
          type: "landing",
          playerUcid: "test1",
          playerName: "Test Pilot",
          unitType: "F-14B",
          unitCategory: "Fixed-wing",
          airdromeName: "Test Field"
        }))
      }
    },
    {
      label: 'Send test change slot event',
      click() {
        udpServer.send(JSON.stringify({
          type: "change_slot",
          playerUcid: "test1",
          playerName: "Test Pilot",
          slotId: "1",
          prevSide: "1"
        }))
      }
    },
    {
      label: 'Send test disconnect event',
      click() {
        udpServer.send(JSON.stringify({
          type: "disconnect",
          playerUcid: "test1",
          playerName: "Test Pilot",
          playerSide: "1",
          reasonCode: "1"
        }))
      }
    },
    {
      label: 'Send test connect event',
      click() {
        udpServer.send(JSON.stringify({
          type: "connect",
          playerUcid: "test1",
          playerName: "Test Pilot"
        }))
      }
    },
    { type: 'separator' },
    {
      label: 'Quit Quoll',
      role: 'quit',
      accelerator: 'CommandOrControl+Q',
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

