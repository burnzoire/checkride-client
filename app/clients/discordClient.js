import https from 'https'
import log from 'electron-log'

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
  constructor(webhookPath) {
    this.host = "discord.com"
    this.path = webhookPath
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
        response.on('data', () => {
          // webhook response empty
          log.info("Sent event to discord successful");
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

export default DiscordClient;