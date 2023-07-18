import dgram from 'dgram'
import http from 'http'
import https from 'https'

import path from 'path'
import { app, Menu, Tray, BrowserWindow, globalShortcut } from 'electron'

import Store from 'electron-store'

import log from 'electron-log'

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
const useSsl = store.get("use_ssl")

const httpModule = useSsl ? https : http

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
  return new Promise(function(resolve, reject) {
    var options = {
      host: store.get("server_host"),
      path: '/ping',
      port: store.get("server_port"),
      method: 'GET',
    }
    log.info(`pinging ${useSsl?"https":"http"}://${options.host} on port ${options.port}`)
    const req = httpModule.request(options, (response) => {
      let body = [];
      response.on('data', (chunk) => {
        body.push(chunk)
      })

      response.on('end', () => {
        try {
          body = JSON.parse(Buffer.concat(body).toString());
        } catch(e) {
            reject(e);
        }
        log.info(body.message)
        resolve(body);
      })

      response.on('error', error => {
        log.error(`couldn't ping the server at ${useSsl?"https":"http"}://${options.host}${options.path} on port ${options.port}.`)
        reject(err);
      })
    })
    req.end()
  })
}

const fetch = require('node-fetch');

async function sendToDiscord(message, publish) {
  const discordWebhookPath = getDiscordWebhookPath();

  if (publish === false || !discordWebhookPath) {
    console.log(`Skipping discord publish: ${publish === false ? 'Event not publishable' : 'No webhook path found'}`);
    return;
  }

  console.log(`Discord webhook path = ${discordWebhookPath}`);

  const payload = JSON.stringify({ content: message });
  const response = await fetch(`https://discord.com${discordWebhookPath}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: payload
  });

  if (!response.ok) {
    throw new Error(`Discord webhook responded with status: ${response.status}`);
  }

  console.log("Sent event to discord successfully");
}

function getDiscordWebhookPath() {
  return store.get("discord_webhook_path") || "";
}

let tray = null
app.whenReady().then(() => {
  if (app.dock) {
    app.dock.hide()
  }

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
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
    {
      label: 'Send test kill event',
      click() {
        const address = server.address()
        server.send(JSON.stringify({
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
        }), address.port, address.address)
      }
    },
    {
      label: 'Send test takeoff event (F-14A)',
      click() {
        const address = server.address()
        server.send(JSON.stringify({
          type: "takeoff",
          playerUcid: "test1",
          playerName: "Test Pilot",
          unitType: "F-14A",
          unitCategory: "Fixed-wing",
          airdromeName: "Test Field"
        }), address.port, address.address)
      }
    },
    {
      label: 'Send test takeoff event (F-14B)',
      click() {
        const address = server.address()
        server.send(JSON.stringify({
          type: "takeoff",
          playerUcid: "test1",
          playerName: "Test Pilot",
          unitType: "F-14B",
          unitCategory: "Fixed-wing",
          airdromeName: "Test Field"
        }), address.port, address.address)
      }
    },
    {
      label: 'Send test landing event (F-14A)',
      click() {
        const address = server.address()
        server.send(JSON.stringify({
          type: "landing",
          playerUcid: "test1",
          playerName: "Test Pilot",
          unitType: "F-14A",
          unitCategory: "Fixed-wing",
          airdromeName: "Test Field"
        }), address.port, address.address)
      }
    },
    {
      label: 'Send test landing event (F-14B)',
      click() {
        const address = server.address()
        server.send(JSON.stringify({
          type: "landing",
          playerUcid: "test1",
          playerName: "Test Pilot",
          unitType: "F-14B",
          unitCategory: "Fixed-wing",
          airdromeName: "Test Field"
        }), address.port, address.address)
      }
    },
    {
      label: 'Send test change slot event',
      click() {
        const address = server.address()
        server.send(JSON.stringify({
          type: "change_slot",
          playerUcid: "test1",
          playerName: "Test Pilot",
          slotId: "1",
          prevSide: "1"
        }), address.port, address.address)
      }
    },
    {
      label: 'Send test disconnect event',
      click() {
        const address = server.address()
        server.send(JSON.stringify({
          type: "disconnect",
          playerUcid: "test1",
          playerName: "Test Pilot",
          playerSide: "1",
          reasonCode: "1"
        }), address.port, address.address)
      }
    },
    {
      label: 'Send test connect event',
      click() {
        const address = server.address()
        server.send(JSON.stringify({
          type: "connect",
          playerUcid: "test1",
          playerName: "Test Pilot"
        }), address.port, address.address)
      }
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
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

const server = dgram.createSocket('udp4');

server.on('error', (err) => {
  log.info(`server error:\n${err.stack}`)
  server.close()
})

server.on('message', (msg, rinfo) => {
  log.debug(`server got: ${msg} from ${rinfo.address}:${rinfo.port}`)
  const event = JSON.parse(msg)
  let payload = "{}"
  let gameEvent = {}
  log.debug("Event type: " + event.type)
  switch(event.type) {
    case "kill":
      log.debug(`killer ucid: ${event.killerUcid} \
        killer name: ${event.killerName}, \ 
        killer unit: ${event.killerUnitType}, \
        victim ucid: ${event.victimUcid}  \
        victim name: ${event.victimName}, \
        victim unit: ${event.victimUnitType}, \
        weapon: ${event.weaponName}`)
      gameEvent = {
        event_type: event.type,
        event: {
          killer_ucid: event.killerUcid,
          killer_name: event.killerName,
          killer_unit_name: event.killerUnitType,
          killer_unit_category: event.killerUnitCategory,
          victim_ucid: event.victimUcid,
          victim_name: event.victimName,
          victim_unit_name: event.victimUnitType,
          victim_unit_category: event.victimUnitCategory,
          weapon_name: event.weaponName
        }
      }
      break;
    case "takeoff":
    case "landing":
      log.debug(`${event.type}: player ucid: ${event.playerUcid} unitType: ${event.unitType} airdromeName: ${event.airdromeName}`)
      gameEvent = {
        event_type: event.type,
        event: {
          player_ucid: event.playerUcid,
          player_name: event.playerName,
          unit_type: event.unitType,
          unit_category: event.unitCategory,
          airdrome_name: event.airdromeName
        }
      }
      break;
    case "crash":
    case "eject":
    case "pilot_death":
      log.debug(`${event.type}: player ucid: ${event.playerUcid} unitType: ${event.unitType}`)
      gameEvent = {
        event_type: event.type,
        event: {
          player_ucid: event.playerUcid,
          player_name: event.playerName,
          unit_type: event.unitType,
          unit_category: event.unitCategory
        }
      }
      break;
    case "self_kill":
      log.debug(`${event.type}: player ucid: ${event.playerUcid}`)
      gameEvent = {
        event_type: event.type,
        event: {
          player_ucid: event.playerUcid,
          player_name: event.playerName
        }
      }
      break;
    case "connect":
      log.debug(`${event.type}: ${event.playerName} connected`)
      gameEvent = {
        event_type: event.type,
        event: {
          player_ucid: event.playerUcid,
          player_name: event.playerName
        }
      }
      break;
    case "disconnect":
      log.debug(`${event.type}: ${event.playerName} disconnected`)
      gameEvent = {
        event_type: event.type,
        event: {
          player_ucid: event.playerUcid,
          player_name: event.playerName,
          player_side: event.playerSide,
          reason_code: event.reasonCode
        }
      }
      break;
    case "change_slot":
      log.debug(`${event.type}: ${event.playerName} selected slot ${event.slotId}`)
      gameEvent = {
        event_type: event.type,
        event: {
          player_ucid: event.playerUcid,
          player_name: event.playerName,
          slot_id: event.slotId,
          prev_side: event.prevSide
        }
      }
      break;
  }
  log.debug("Sending game event to server: ", gameEvent)
  payload = new TextEncoder().encode(
    JSON.stringify(gameEvent)
  )

  sendEventToServer(payload, "/events")
    .then((body) => {
      log.debug(body)
      const eventSummary = body.summary
      const awards = body.awards
      const publish = body.publish
      log.debug("Event saved:", eventSummary)
      sendToDiscord(eventSummary, publish)
        .catch(err => log.error("Couldn't send to discord: "+err))
        .finally(() => {
          awards.forEach((award) => {
            const awardMessage = `:military_medal: ${award.pilot} has been awarded the "${award.badge.title}" badge!`
            log.info(awardMessage)
            sendToDiscord(awardMessage)
              .catch((err) => {
                log.error("Couldn't send award to discord: "+err)
              })
          })
        })
    })
    .catch(err => log.error("Failed to save event: " + err))
})

function sendEventToServer(payload, eventsPath) {
  return new Promise(function(resolve, reject) {
    var options = {
      host: store.get("server_host"),
      path: eventsPath,
      port: store.get("server_port"),
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': payload.length
      }
    }

    const req = httpModule.request(options, (response) => {
      let body = [];
      response.on('data', (chunk) => {
        body.push(chunk)
      })

      response.on('end', () => {
        try {
          body = JSON.parse(Buffer.concat(body).toString());
        } catch(e) {
            reject(e);
        }
        resolve(body);
      })

      response.on('error', error => {
        reject(err);
      })
    })
    if(payload){
      req.write(payload)
    }
    req.end()
  })
}

server.on('listening', () => {
  const address = server.address()
  log.info(`server listening ${address.address}:${address.port}`)
})

server.bind(41234)
// Prints: server listening 0.0.0.0:
