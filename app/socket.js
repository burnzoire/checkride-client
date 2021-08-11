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

function ping() {
  var options = {
    host: 'localhost',
    path: '/ping',
    port: '3000',
    method: 'GET',
  }

  const req = https.request(options, res => {
    console.log(`statusCode: ${res.statusCode}`)
  
    res.on('data', d => {
      process.stdout.write(d)
    })
  })
  
  req.on('error', error => {
    console.error(error)
  })
  
  req.end()
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
      click() { ping() }
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

  ping()

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
  let payload = "{}"
  let path = ""
  if(event.type == "kill") {
    console.log(`killer ucid: ${event.killerUcid} killer name: ${event.killerName}, killer unit: ${event.killerUnitType}, victim ucid: ${event.victimUcid}  victim name: ${event.victimName}, victim unit: ${event.victimUnitType}, weapon: ${event.weaponName}`)

    path = '/kill_events'
    
    payload = new TextEncoder().encode(
      JSON.stringify({
        kill_event: {
          killer_ucid: event.killerUcid,
          killer_name: event.killerName,
          killer_unit_name: event.killerUnitType,
          victim_ucid: event.victimUcid,
          victim_name: event.victimName,
          victim_unit_name: event.victimUnitType,
          weapon_name: event.weaponName
        }
      })
    )
  }

  var options = {
    host: 'localhost',
    path: path,
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
// Prints: server listening 0.0.0.0:  
