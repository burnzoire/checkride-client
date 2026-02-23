const https = require('https');
const log = require('electron-log');
class DiscordClientError extends Error {
  constructor(message) {
    super(message);
    this.name = 'DiscordClientError';
  }
}

class DiscordPublishError extends DiscordClientError {
  constructor(message) {
    super(message);
    this.name = 'DiscordPublishError';
  }
}

class DiscordConnectionError extends DiscordClientError {
  constructor(message) {
    super(message);
    this.name = 'DiscordConnectionError';
  }
}
class DiscordClient {
  constructor(webhookPath) {
    this.host = "discord.com"
    this.path = webhookPath
    this.maxRetries = 3
    this.queue = Promise.resolve()
    this.allowInsecureTls = String(process.env.DISCORD_INSECURE_TLS || '').toLowerCase() === '1'
      || String(process.env.DISCORD_INSECURE_TLS || '').toLowerCase() === 'true';
    if (this.allowInsecureTls) {
      log.warn('Discord client is running with DISCORD_INSECURE_TLS enabled; TLS verification is disabled for webhooks.');
    }
    this.rateLimit = {
      remaining: null,
      resetAfterMs: null,
      resetAtMs: null,
      bucket: null
    }
    const minIntervalRaw = Number(process.env.DISCORD_MIN_SEND_INTERVAL_MS);
    this.minSendIntervalMs = Number.isFinite(minIntervalRaw) ? minIntervalRaw : 20
    this.lastSendAtMs = null
    this.requestTimeoutMs = 30000
  }

  updateWebhookPath(webhookPath) {
    this.path = webhookPath
  }

  async send(message, publish) {
    if (!this.path) {
      log.info("Discord webhook path not set, skipping discord notification");
      return;
    }
    if (publish === false) {
      throw new DiscordPublishError("Event not publishable")
    }
    if (!message) {
      log.info("Discord message missing, skipping discord notification");
      return;
    }

    return this.enqueue(() => this.sendWithRateLimit(message, publish))
  }

  enqueue(fn) {
    const run = this.queue.then(fn)
    this.queue = run.catch(() => {})
    return run
  }

  async sendWithRateLimit(message, publish) {
    await this.waitForRateLimitSlot()

    if (Number.isFinite(this.minSendIntervalMs) && this.minSendIntervalMs > 0) {
      const now = Date.now();
      const lastAt = this.lastSendAtMs || 0;
      const waitMs = this.minSendIntervalMs - (now - lastAt);
      if (waitMs > 0) {
        await this.sleep(waitMs);
      }
    }

    let attempt = 0;

    while (attempt < this.maxRetries) {
      attempt += 1;

      log.info(`Sending discord webhook to ${this.host}${this.path}`);

      const payload = Buffer.from(JSON.stringify({ content: message }), 'utf8');
      const options = {
        host: this.host,
        path: this.path,
        method: 'POST',
        // Local-only bypass for Discord TLS verification.
        rejectUnauthorized: !this.allowInsecureTls,
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
          'Content-Length': payload.length,
        },
      };

      const response = await this.sendOnce(options, payload);
      this.lastSendAtMs = Date.now();
      log.debug('Discord rate limit headers', {
        remaining: response.headers?.['x-ratelimit-remaining'] || response.headers?.['X-RateLimit-Remaining'],
        resetAfter: response.headers?.['x-ratelimit-reset-after'] || response.headers?.['X-RateLimit-Reset-After'],
        resetAt: response.headers?.['x-ratelimit-reset'] || response.headers?.['X-RateLimit-Reset'],
        bucket: response.headers?.['x-ratelimit-bucket'] || response.headers?.['X-RateLimit-Bucket'],
        retryAfter: response.headers?.['retry-after'] || response.headers?.['Retry-After']
      });
      this.updateRateLimitFromHeaders(response.headers);
      const status = response.statusCode || 0;

      if (status == 429) {
        const delayMs = this.retryDelayFromHeaders(response.headers) || 1000;
        log.info(`Discord rate limited; retrying in ${delayMs}ms (attempt ${attempt}/${this.maxRetries})`);
        if (attempt >= this.maxRetries) {
          throw new DiscordPublishError(`Discord rate limited after ${this.maxRetries} attempts`);
        }
        await this.sleep(delayMs);
        continue;
      }

      if (status < 200 || status >= 300) {
        const body = response.body || '';
        throw new DiscordPublishError(`Discord responded with status ${status}: ${body}`);
      }

      log.info("Sent event to discord successful");
      return;
    }
  }

  updateRateLimitFromHeaders(headers) {
    if (!headers) return;

    const remainingRaw = headers['x-ratelimit-remaining'] || headers['X-RateLimit-Remaining'];
    const resetAfterRaw = headers['x-ratelimit-reset-after'] || headers['X-RateLimit-Reset-After'];
    const resetAtRaw = headers['x-ratelimit-reset'] || headers['X-RateLimit-Reset'];
    const bucketRaw = headers['x-ratelimit-bucket'] || headers['X-RateLimit-Bucket'];

    const remaining = Number(remainingRaw);
    this.rateLimit.remaining = Number.isFinite(remaining) ? remaining : this.rateLimit.remaining;

    const resetAfter = Number(resetAfterRaw);
    this.rateLimit.resetAfterMs = Number.isFinite(resetAfter) ? Math.max(0, Math.round(resetAfter * 1000)) : this.rateLimit.resetAfterMs;

    const resetAt = Number(resetAtRaw);
    this.rateLimit.resetAtMs = Number.isFinite(resetAt) ? Math.max(0, Math.round(resetAt * 1000)) : this.rateLimit.resetAtMs;

    if (bucketRaw) {
      this.rateLimit.bucket = bucketRaw;
    }
  }

  async waitForRateLimitSlot() {
    if (this.rateLimit.remaining !== 0) return;

    let delayMs = null;
    if (Number.isFinite(this.rateLimit.resetAfterMs)) {
      delayMs = this.rateLimit.resetAfterMs;
    } else if (Number.isFinite(this.rateLimit.resetAtMs)) {
      delayMs = Math.max(0, this.rateLimit.resetAtMs - Date.now());
    }

    if (delayMs && delayMs > 0) {
      log.info(`Discord rate limit reached; waiting ${delayMs}ms before next send`);
      await this.sleep(delayMs);
    }

    this.rateLimit.remaining = null;
    this.rateLimit.resetAfterMs = null;
    this.rateLimit.resetAtMs = null;
  }

  sendOnce(options, payload) {
    return new Promise((resolve, reject) => {
      const req = https.request(options, (response) => {
        log.info(`Discord response status: ${response.statusCode}`);

        const chunks = [];
        response.on('data', (chunk) => {
          if (chunk) chunks.push(chunk);
        });

        response.on('end', () => {
          resolve({
            statusCode: response.statusCode,
            headers: response.headers || {},
            body: Buffer.concat(chunks).toString('utf8')
          });
        });

        response.on('error', error => {
          reject(new DiscordPublishError(`Error while sending event to discord: ${error}`));
        });
      });

      req.setTimeout(this.requestTimeoutMs, () => {
        req.destroy(new Error('Discord request timed out'));
      });

      req.on('error', error => {
        reject(new DiscordConnectionError(`Error while establishing connection to discord: ${error}`));
      });

      req.write(payload);
      req.end();
    });
  }

  retryDelayFromHeaders(headers) {
    if (!headers) return null;

    const retryAfter = headers['retry-after'] || headers['Retry-After'];
    const resetAfter = headers['x-ratelimit-reset-after'] || headers['X-RateLimit-Reset-After'];
    const resetAt = headers['x-ratelimit-reset'] || headers['X-RateLimit-Reset'];

    if (retryAfter) {
      const asNumber = Number(retryAfter);
      if (Number.isFinite(asNumber)) {
        return Math.max(0, Math.round(asNumber * 1000));
      }

      const asDate = Date.parse(retryAfter);
      if (!Number.isNaN(asDate)) {
        return Math.max(0, asDate - Date.now());
      }
    }

    if (resetAfter) {
      const asNumber = Number(resetAfter);
      if (Number.isFinite(asNumber)) {
        return Math.max(0, Math.round(asNumber * 1000));
      }
    }

    if (resetAt) {
      const asNumber = Number(resetAt);
      if (Number.isFinite(asNumber)) {
        return Math.max(0, Math.round((asNumber * 1000) - Date.now()));
      }
    }

    return null;
  }

  sleep(ms) {
    if (!ms || ms <= 0) {
      return Promise.resolve();
    }

    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

module.exports = {
  DiscordClient,
  DiscordClientError,
  DiscordPublishError,
  DiscordConnectionError
}
