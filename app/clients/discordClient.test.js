const https = require('https');
const { DiscordClient, DiscordClientError, DiscordPublishError, DiscordConnectionError } = require('./discordClient');

jest.mock('electron-log');

describe('DiscordClient', () => {
  let mockRequest;
  let mockResponse;
  let mockReq;

  beforeEach(() => {
    mockReq = {
      write: jest.fn(),
      end: jest.fn(),
      on: jest.fn(),
    };

    mockResponse = {
      statusCode: 204,
      on: jest.fn(),
    };

    mockRequest = jest.fn((options, callback) => {
      const handlers = {};

      mockReq.on = jest.fn((event, handler) => {
        handlers[event] = handler;
        return mockReq;
      });

      // Call the callback immediately with the mock response
      process.nextTick(() => {
        callback(mockResponse);
      });

      return mockReq;
    });

    jest.spyOn(https, 'request').mockImplementation(mockRequest);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('constructor', () => {
    it('should create an instance with webhook path', () => {
      const webhookPath = '/api/webhooks/123456/abcdef';
      const client = new DiscordClient(webhookPath);

      expect(client.host).toBe('discord.com');
      expect(client.path).toBe(webhookPath);
    });

    it('should allow updating the webhook path', () => {
      const client = new DiscordClient('/first');
      client.updateWebhookPath('/second');
      expect(client.path).toBe('/second');
    });
  });

  describe('send', () => {
    it('should successfully send a message to Discord', async () => {
      const webhookPath = '/api/webhooks/123456/abcdef';
      const client = new DiscordClient(webhookPath);
      const message = 'Test message';

      mockResponse.on = jest.fn((event, handler) => {
        if (event === 'end') {
          handler();
        }
      });

      await expect(client.send(message, true)).resolves.toBeUndefined();

      expect(mockRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          host: 'discord.com',
          path: webhookPath,
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
        }),
        expect.any(Function)
      );

      const writtenData = mockReq.write.mock.calls[0][0];
      const payload = JSON.parse(new TextDecoder().decode(writtenData));
      expect(payload.content).toBe(message);
      expect(mockReq.end).toHaveBeenCalled();
    });

    it('should reject when publish is false', async () => {
      const webhookPath = '/api/webhooks/123456/abcdef';
      const client = new DiscordClient(webhookPath);
      const message = 'Test message';

      await expect(client.send(message, false)).rejects.toThrow(DiscordPublishError);
      await expect(client.send(message, false)).rejects.toThrow('Event not publishable');
    });

    it('should reject when webhook path is empty', async () => {
      const client = new DiscordClient('');
      const message = 'Test message';

      await expect(client.send(message, true)).rejects.toThrow(DiscordPublishError);
      await expect(client.send(message, true)).rejects.toThrow('No webhook path found');
    });

    it('should reject on response error', async () => {
      const webhookPath = '/api/webhooks/123456/abcdef';
      const client = new DiscordClient(webhookPath);
      const message = 'Test message';
      const error = new Error('Connection reset');

      mockResponse.on = jest.fn((event, handler) => {
        if (event === 'error') {
          handler(error);
        }
      });

      await expect(client.send(message, true)).rejects.toThrow(DiscordPublishError);
      await expect(client.send(message, true)).rejects.toThrow(`Error while sending event to discord: ${error}`);
    });

    it('should reject on request error', async () => {
      const webhookPath = '/api/webhooks/123456/abcdef';
      const client = new DiscordClient(webhookPath);
      const message = 'Test message';
      const error = new Error('ECONNREFUSED');

      mockRequest.mockImplementation((options, callback) => {
        const handlers = {};
        mockReq.on = jest.fn((event, handler) => {
          handlers[event] = handler;
          return mockReq;
        });

        process.nextTick(() => {
          handlers.error(error);
        });

        return mockReq;
      });

      await expect(client.send(message, true)).rejects.toThrow(DiscordConnectionError);
      await expect(client.send(message, true)).rejects.toThrow(`Error while establishing connection to discord: ${error}`);
    });

    it('should send messages with special characters', async () => {
      const webhookPath = '/api/webhooks/123456/abcdef';
      const client = new DiscordClient(webhookPath);
      const message = 'Test with emoji 🎮 and special chars: <@123>';

      mockResponse.on = jest.fn((event, handler) => {
        if (event === 'end') {
          handler();
        }
      });

      await expect(client.send(message, true)).resolves.toBeUndefined();

      const writtenData = mockReq.write.mock.calls[0][0];
      const payload = JSON.parse(new TextDecoder().decode(writtenData));
      expect(payload.content).toBe(message);
    });
  });

  describe('Error Classes', () => {
    it('should create DiscordClientError with correct name', () => {
      const error = new DiscordClientError('test error');
      expect(error).toBeInstanceOf(Error);
      expect(error).toBeInstanceOf(DiscordClientError);
      expect(error.name).toBe('DiscordClientError');
      expect(error.message).toBe('test error');
    });

    it('should create DiscordPublishError with correct name', () => {
      const error = new DiscordPublishError('publish error');
      expect(error).toBeInstanceOf(Error);
      expect(error).toBeInstanceOf(DiscordClientError);
      expect(error).toBeInstanceOf(DiscordPublishError);
      expect(error.name).toBe('DiscordPublishError');
      expect(error.message).toBe('publish error');
    });

    it('should create DiscordConnectionError with correct name', () => {
      const error = new DiscordConnectionError('connection error');
      expect(error).toBeInstanceOf(Error);
      expect(error).toBeInstanceOf(DiscordClientError);
      expect(error).toBeInstanceOf(DiscordConnectionError);
      expect(error.name).toBe('DiscordConnectionError');
      expect(error.message).toBe('connection error');
    });
  });
});
