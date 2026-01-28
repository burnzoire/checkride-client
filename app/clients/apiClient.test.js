const http = require('http');
const https = require('https');
const { APIClient, APIClientError, APISaveEventError } = require('./apiClient');

jest.mock('electron-log');

describe('APIClient', () => {
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
      statusCode: 201,
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

    jest.spyOn(http, 'request').mockImplementation(mockRequest);
    jest.spyOn(https, 'request').mockImplementation(mockRequest);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('constructor', () => {
    it('should create an instance with http when useSsl is false', () => {
      const client = new APIClient(false, 'localhost', 3000);
      expect(client.useSsl).toBe(false);
      expect(client.httpModule).toBe(http);
      expect(client.host).toBe('localhost');
      expect(client.port).toBe(3000);
      expect(client.apiToken).toBe('');
    });

    it('should create an instance with https when useSsl is true', () => {
      const client = new APIClient(true, 'example.com', 443, 'token');
      expect(client.useSsl).toBe(true);
      expect(client.httpModule).toBe(https);
      expect(client.host).toBe('example.com');
      expect(client.port).toBe(443);
      expect(client.apiToken).toBe('token');
    });
  });

  describe('update', () => {
    it('should update transport and connection details', () => {
      const client = new APIClient(false, 'localhost', 3000, 'token-1');

      client.update({ useSsl: true, host: 'api.example.com', port: 443 });

      expect(client.useSsl).toBe(true);
      expect(client.httpModule).toBe(https);
      expect(client.host).toBe('api.example.com');
      expect(client.port).toBe(443);
      expect(client.apiToken).toBe('token-1');

      client.update({ useSsl: false, host: 'internal', port: 8080, apiToken: 'token-2' });

      expect(client.useSsl).toBe(false);
      expect(client.httpModule).toBe(http);
      expect(client.host).toBe('internal');
      expect(client.port).toBe(8080);
      expect(client.apiToken).toBe('token-2');
    });
  });

  describe('buildHeaders', () => {
    it('merges additional headers and appends authorization when token is set', () => {
      const client = new APIClient(false, 'localhost', 3000, 'secret');

      const headers = client.buildHeaders({ 'Content-Type': 'application/json' });

      expect(headers).toEqual({
        'Content-Type': 'application/json',
        'Authorization': 'Bearer secret',
      });
    });

    it('returns a copy of additional headers when token is empty', () => {
      const client = new APIClient(false, 'localhost', 3000);
      const input = { Accept: 'application/json' };

      const headers = client.buildHeaders(input);

      expect(headers).toEqual(input);
      expect(headers).not.toBe(input);
    });
  });

  describe('saveEvent', () => {
    it('should successfully save an event', async () => {
      const client = new APIClient(false, 'localhost', 3000);
      const payload = { type: 'test', data: 'sample' };
      const responseBody = { id: 1, message: 'Event saved' };

      mockResponse.statusCode = 201;
      mockResponse.on = jest.fn((event, handler) => {
        if (event === 'data') {
          handler(Buffer.from(JSON.stringify(responseBody)));
        } else if (event === 'end') {
          handler();
        }
      });

      const result = await client.saveEvent(payload);

      expect(result).toEqual(responseBody);
      expect(mockRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          host: 'localhost',
          path: '/events',
          port: 3000,
          method: 'POST',
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
          }),
        }),
        expect.any(Function)
      );
      expect(mockReq.write).toHaveBeenCalledWith(JSON.stringify(payload));
      expect(mockReq.end).toHaveBeenCalled();
    });

    it('should include bearer token when provided', async () => {
      jest.clearAllMocks();

      const client = new APIClient(false, 'localhost', 3000, 'secret');
      const payload = { type: 'test', data: 'sample' };
      const responseBody = { id: 1 };

      mockResponse.statusCode = 201;
      mockResponse.on = jest.fn((event, handler) => {
        if (event === 'data') {
          handler(Buffer.from(JSON.stringify(responseBody)));
        } else if (event === 'end') {
          handler();
        }
      });

      await client.saveEvent(payload);

      const options = mockRequest.mock.calls[0][0];
      expect(options.headers['Authorization']).toBe('Bearer secret');
    });

    it('should reject when response status code is not 201', async () => {
      const client = new APIClient(false, 'localhost', 3000);
      const payload = { type: 'test' };
      const errorMessage = 'Bad request';

      mockResponse.statusCode = 400;
      mockResponse.on = jest.fn((event, handler) => {
        if (event === 'data') {
          handler(Buffer.from(errorMessage));
        } else if (event === 'end') {
          handler();
        }
      });

      await expect(client.saveEvent(payload)).rejects.toThrow(APISaveEventError);
      await expect(client.saveEvent(payload)).rejects.toThrow(`Failed to save event: ${errorMessage}`);
    });

    it('should reject when response body cannot be parsed', async () => {
      const client = new APIClient(false, 'localhost', 3000);
      const payload = { type: 'test' };

      mockResponse.statusCode = 201;
      mockResponse.on = jest.fn((event, handler) => {
        if (event === 'data') {
          handler(Buffer.from('invalid json'));
        } else if (event === 'end') {
          handler();
        }
      });

      await expect(client.saveEvent(payload)).rejects.toThrow(APISaveEventError);
      await expect(client.saveEvent(payload)).rejects.toThrow('Failed to parse API response');
    });

    it('should reject on response error', async () => {
      const client = new APIClient(false, 'localhost', 3000);
      const payload = { type: 'test' };
      const error = new Error('Connection reset');

      mockResponse.on = jest.fn((event, handler) => {
        if (event === 'error') {
          handler(error);
        }
      });

      await expect(client.saveEvent(payload)).rejects.toThrow(APIClientError);
      await expect(client.saveEvent(payload)).rejects.toThrow(`API request failed: ${error}`);
    });

    it('should reject on request error', async () => {
      const client = new APIClient(false, 'localhost', 3000);
      const payload = { type: 'test' };
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

      await expect(client.saveEvent(payload)).rejects.toThrow(APIClientError);
      await expect(client.saveEvent(payload)).rejects.toThrow(`API request failed: ${error}`);
    });
  });

  describe('ping', () => {
    it('should successfully ping the server', async () => {
      const client = new APIClient(false, 'localhost', 3000);
      const responseBody = { message: 'pong' };

      mockResponse.statusCode = 200;
      mockResponse.on = jest.fn((event, handler) => {
        if (event === 'data') {
          handler(Buffer.from(JSON.stringify(responseBody)));
        } else if (event === 'end') {
          handler();
        }
      });

      const result = await client.ping();

      expect(result).toEqual(responseBody);
      expect(mockRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          host: 'localhost',
          path: '/ping',
          port: 3000,
          method: 'GET',
        }),
        expect.any(Function)
      );
      expect(mockReq.end).toHaveBeenCalled();
    });

    it('should include bearer token on ping when provided', async () => {
      jest.clearAllMocks();

      const client = new APIClient(false, 'localhost', 3000, 'ping-token');
      const responseBody = { message: 'pong' };

      mockResponse.on = jest.fn((event, handler) => {
        if (event === 'data') {
          handler(Buffer.from(JSON.stringify(responseBody)));
        } else if (event === 'end') {
          handler();
        }
      });

      await client.ping();

      const options = mockRequest.mock.calls[0][0];
      expect(options.headers['Authorization']).toBe('Bearer ping-token');
    });

    it('should use https when useSsl is true', async () => {
      // Clear previous mock calls
      jest.clearAllMocks();

      const client = new APIClient(true, 'example.com', 443);
      const responseBody = { message: 'pong' };

      mockResponse.on = jest.fn((event, handler) => {
        if (event === 'data') {
          handler(Buffer.from(JSON.stringify(responseBody)));
        } else if (event === 'end') {
          handler();
        }
      });

      await client.ping();

      expect(https.request).toHaveBeenCalled();
      expect(http.request).not.toHaveBeenCalled();
    });

    it('should reject on response error', async () => {
      const client = new APIClient(false, 'localhost', 3000);
      const error = new Error('Timeout');

      mockResponse.on = jest.fn((event, handler) => {
        if (event === 'error') {
          handler(error);
        }
      });

      await expect(client.ping()).rejects.toThrow(APIClientError);
      await expect(client.ping()).rejects.toThrow(`Failed to ping API: ${error}`);
    });

    it('should reject on request error', async () => {
      const client = new APIClient(false, 'localhost', 3000);
      const error = new Error('Network error');

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

      await expect(client.ping()).rejects.toThrow(APIClientError);
      await expect(client.ping()).rejects.toThrow(`API request failed: ${error}`);
    });
  });

  describe('Error Classes', () => {
    it('should create APIClientError with correct name', () => {
      const error = new APIClientError('test error');
      expect(error).toBeInstanceOf(Error);
      expect(error).toBeInstanceOf(APIClientError);
      expect(error.name).toBe('APIClientError');
      expect(error.message).toBe('test error');
    });

    it('should create APISaveEventError with correct name', () => {
      const error = new APISaveEventError('save error');
      expect(error).toBeInstanceOf(Error);
      expect(error).toBeInstanceOf(APIClientError);
      expect(error).toBeInstanceOf(APISaveEventError);
      expect(error.name).toBe('APISaveEventError');
      expect(error.message).toBe('save error');
    });
  });
});
