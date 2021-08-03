import dgram from 'dgram'
import http from 'http'

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
  console.log(`server error:\n${err.stack}`)
  server.close()
});

server.on('message', (msg, rinfo) => {
  console.log(`server got: ${msg} from ${rinfo.address}:${rinfo.port}`)
  let event = JSON.parse(msg)
  if(event.type == "kill") {
    console.log(`killer: ${event.killerName}, killer unit: ${event.killerUnitType}, victim: ${event.victimName}, victim unit: ${event.victimUnitType}, weapon: ${event.weaponName}`)
  }

  const payload = new TextEncoder().encode(
    JSON.stringify({
      kill_event: {
        killer_name: event.killerName,
        killer_unit_name: event.killerUnitType,
        victim_name: event.victimName,
        victim_unit_name: event.victimUnitType,
        weapon_name: event.weaponName
      }
    })
  )

  var options = {
    host: 'localhost',
    path: '/kill_events',
    port: '3000',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': payload.length
    }
  }
  
  let req = http.request(options, (response) => {
    let str = ''
    response.on('data', (chunk) => {
      str += chunk
    })
  
    response.on('end', () => {
      console.log(str)
    })

    response.on('error', error => {
      console.error(error)
    })
  })
  req.write(payload)
  req.end()
})

server.on('listening', () => {
  const address = server.address()
  console.log(`server listening ${address.address}:${address.port}`)
})

server.bind(41234)
// Prints: server listening 0.0.0.0:41234