import https from 'https'
import log from 'electron-log'
import store from './config'

class DiscordClient {
  constructor() {
    this.host = "discord.com";
    this.path = store.get("discord_webhook_path");
  }

  async send(message, publish) {
    if (publish === false) {
      log.debug("skipping discord publish: event not publishable");
      return;
    }
    if (this.path === "") {
      log.debug("skipping discord publish: no webhook path found");
      return;
    }

    const options = {
      host: this.host,
      path: this.path,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
    };

    const payload = new TextEncoder().encode(JSON.stringify({ content: message }));

    return new Promise((resolve, reject) => {
      const req = https.request(options, (response) => {
        response.on('end', () => {
          // webhook response empty
          log.info("sent event to discord successful");
          resolve();
        });

        response.on('error', error => {
          log.error("error while sending event to discord", error);
          reject(error);
        });
      });

      req.on('error', error => {
        log.error("error while establishing connection to discord", error);
        reject(error);
      });

      req.write(payload);
      req.end();
    });
  }
}

const discord = new DiscordClient();
export default discord;