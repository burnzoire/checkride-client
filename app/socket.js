import dgram from 'dgram'
import http from 'http'
import https from 'https'

import path from 'path'
import { app, Menu, Tray, BrowserWindow, globalShortcut } from 'electron'

import Store from 'electron-store'
const store = new Store();

if(!store.has("server_host")) {
  store.set("server_host", "localhost")
}

if(!store.has("server_port")) {
  store.set("server_port", "80")
}

if(!store.has("use_ssl")) {
  store.set("use_ssl", false)
}

if(!store.has("discord_webhook_path")) {
  store.set("discord_webhook_path", "")
}
const use_ssl = store.get("use_ssl")

const http_module = use_ssl?https:http

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
    host: store.get("server_host"),
    path: '/ping',
    port: store.get("server_port"),
    method: 'GET',
  }
  let req
  
  req = http_module.request(options, res => {
    console.log(`statusCode: ${res.statusCode}`)
  
    res.on('data', d => {
      process.stdout.write(`${d}\n`)
    })
  })


  req.on('error', error => {
    console.error(`couldn't ping the server at ${use_ssl?"https":"http"}://${options.host}${options.path} on port ${options.port}.`)
  })
  
  req.end()
}

function sendToDiscord(message)  {
  let payload = "{}"
  var options = {
    host: "discord.com",
    path: store.get("discord_webhook_path"),
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    }
  }

  payload =  new TextEncoder().encode(
      JSON.stringify({
      content: message
    })
  )
  
  let req = https.request(options, (response) => {
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

})

app.on('window-all-closed', function () {
  if (process.platform !== 'darwin') app.quit()
})

const server = dgram.createSocket('udp4');

server.on('error', (err) => {
  console.log(`server error:\n${err.stack}`)
  server.close()
})

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

    sendToDiscord(`${event.killerName} destroyed ${(event.victimName=="")?"AI":event.victimName} ${event.victimUnitType} with ${event.weaponName}`)
    
  }

  var options = {
    host: store.get("server_host"),
    path: path,
    port: store.get("server_port"),
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': payload.length
    }
  }
  
  let req = http_module.request(options, (response) => {
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
