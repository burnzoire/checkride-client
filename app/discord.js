import https from 'https'
import log from 'electron-log'
import store from './config'

export default function sendToDiscord(message, publish) {
  let discordWebhookPath = store.get("discord_webhook_path")
  if(publish === false) {
    log.debug("skipping discord publish: event not publishable")
    return Promise.resolve()
  }
  if(discordWebhookPath === "") {
    log.debug("skipping discord publish: no webhook path found")
    return Promise.resolve()
  }
  return new Promise(function(resolve, reject) {
    let payload = "{}"
    var options = {
      host: "discord.com",
      path: discordWebhookPath,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      }
    }
    if(options.path === "") { resolve() }
    payload =  new TextEncoder().encode(
      JSON.stringify({
        content: message
      })
    )

    let req = https.request(options, (response) => {
      let body = [];
      response.on('data', (chunk) => {
        body.push(chunk)
      })

      response.on('end', () => {
        // webhook response empty
        log.info("sent event to discord successful")
        resolve();
      })

      response.on('error', error => {
        reject(err);
      })
    })
    req.write(payload)
    req.end()
  })
}