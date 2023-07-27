const nock = require('nock');
nock.emitter.on('no match', req => console.log('No match for request', req));

const { DiscordClient, DiscordPublishError, DiscordConnectionError } = require('./discordClient');

describe('DiscordClient', () => {
  let client;
  const host = 'discord.com';
  const path = '/api/webhook/test';

  beforeEach(() => {
    client = new DiscordClient(path);
  });

  afterEach(() => {
    nock.cleanAll();
    jest.restoreAllMocks();
  });

  describe('send', () => {
    it('rejects when event is not publishable', async () => {
      await expect(client.send('test message', false)).rejects.toThrow(DiscordPublishError);
    });

    it('rejects when no webhook path is provided', async () => {
      const noPathClient = new DiscordClient('');

      await expect(noPathClient.send('test message', true)).rejects.toThrow(DiscordPublishError);
    });

    it('successfully sends message when publishable', async () => {
      nock(`https://${host}`)
        .post(path)
        .reply(204);

      await expect(() => client.send('test message', true)).not.toThrow();
    });

    it('throws an error when the message cannot be sent', async () => {
      nock(`https://${host}`)
        .post(path)
        .replyWithError('Failed to send message');

      await expect(client.send('test message', true)).rejects.toThrow(DiscordConnectionError);
    });

    it('throws an error when the connection cannot be established', async () => {
      jest.spyOn(DiscordClient.prototype, 'send').mockImplementation(() => {
        throw new DiscordConnectionError('Connection failed');
      });

      try {
        await client.send('test message', true);
      } catch (error) {
        expect(error).toBeInstanceOf(DiscordConnectionError);
      }
    });
  });
});
