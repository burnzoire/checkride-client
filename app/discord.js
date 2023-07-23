import https from 'https'
import log from 'electron-log'
import store from './config'

export class DiscordClientError extends Error {
  constructor(message) {
    super(message);
    this.name = 'DiscordClientError';
  }
}

export class DiscordPublishError extends DiscordClientError {
  constructor(message) {
    super(message);
    this.name = 'DiscordPublishError';
  }
}

export class DiscordConnectionError extends DiscordClientError {
  constructor(message) {
    super(message);
    this.name = 'DiscordConnectionError';
  }
}
class DiscordClient {
  constructor() {
    this.host = "discord.com";
    this.path = store.get("discord_webhook_path");
  }

  async send(message, publish) {
    if (publish === false) {
      throw new DiscordPublishError("Event not publishable")
    }
    if (this.path === "") {
      throw new DiscordPublishError("No webhook path found")
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
          reject(new DiscordPublishError(`Error while sending event to discord: ${error}`));
        });
      });

      req.on('error', error => {
        reject(new DiscordConnectionError(`Error while establishing connection to discord: ${error}`));
      });

      req.write(payload);
      req.end();
    });
  }
}

const discord = new DiscordClient();
export default discord;