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
      expect(client.clientVersion).toBeNull();
    });

    it('should create an instance with https when useSsl is true', () => {
      const client = new APIClient(true, 'example.com', 443, 'token');
      expect(client.useSsl).toBe(true);
      expect(client.httpModule).toBe(https);
      expect(client.host).toBe('example.com');
      expect(client.port).toBe(443);
      expect(client.apiToken).toBe('token');
      expect(client.clientVersion).toBeNull();
    });

    it('accepts a client version when provided', () => {
      const client = new APIClient(true, 'example.com', 443, 'token', '/api', '1.2.3');
      expect(client.clientVersion).toBe('1.2.3');
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
      expect(client.clientVersion).toBeNull();

      client.update({ useSsl: false, host: 'internal', port: 8080, apiToken: 'token-2', clientVersion: '2.0.0' });

      expect(client.useSsl).toBe(false);
      expect(client.httpModule).toBe(http);
      expect(client.host).toBe('internal');
      expect(client.port).toBe(8080);
      expect(client.apiToken).toBe('token-2');
      expect(client.clientVersion).toBe('2.0.0');
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

    it('includes X-Checkride-Client-Version when version is set', () => {
      const client = new APIClient(false, 'localhost', 3000, '', '', '1.2.3');

      const headers = client.buildHeaders();

      expect(headers).toEqual({
        'X-Checkride-Client-Version': '1.2.3',
      });
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

  describe('healthcheck', () => {
    it('should use https when useSsl is true', async () => {
      jest.clearAllMocks();

      const client = new APIClient(true, 'example.com', 443);

      mockResponse.statusCode = 200;
      mockResponse.on = jest.fn((event, handler) => {
        if (event === 'end') {
          handler();
        }
      });

      await expect(client.healthcheck()).resolves.toEqual({ status: 'ok' });

      expect(https.request).toHaveBeenCalled();
      expect(http.request).not.toHaveBeenCalled();
    });

    it('should resolve when status code is 200', async () => {
      const client = new APIClient(false, 'localhost', 3000);

      mockResponse.statusCode = 200;
      mockResponse.on = jest.fn((event, handler) => {
        if (event === 'end') {
          handler();
        }
      });

      await expect(client.healthcheck()).resolves.toEqual({ status: 'ok' });
    });

    it('should reject when status code is not ok', async () => {
      const client = new APIClient(false, 'localhost', 3000);

      mockResponse.statusCode = 500;
      mockResponse.on = jest.fn((event, handler) => {
        if (event === 'end') {
          handler();
        }
      });

      await expect(client.healthcheck()).rejects.toThrow(APIClientError);
      await expect(client.healthcheck()).rejects.toThrow('Healthcheck failed with status 500');
    });

    it('should reject on response error', async () => {
      const client = new APIClient(false, 'localhost', 3000);
      const error = new Error('Timeout');

      mockResponse.on = jest.fn((event, handler) => {
        if (event === 'error') {
          handler(error);
        }
      });

      await expect(client.healthcheck()).rejects.toThrow(APIClientError);
      await expect(client.healthcheck()).rejects.toThrow(`Healthcheck request failed: ${error}`);
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

      await expect(client.healthcheck()).rejects.toThrow(APIClientError);
      await expect(client.healthcheck()).rejects.toThrow(`API request failed: ${error}`);
    });
  });

  describe('saveAchievement', () => {
    it('resolves with parsed JSON on 201', async () => {
      const client = new APIClient(false, 'localhost', 3000);
      const responseBody = { id: 1, achievement_id: 'carrier_qualified' };

      mockResponse.statusCode = 201;
      mockResponse.on = jest.fn((event, handler) => {
        if (event === 'data') handler(Buffer.from(JSON.stringify(responseBody)));
        else if (event === 'end') handler();
      });

      const result = await client.saveAchievement({ playerUcid: 'abc123', achievementId: 'carrier_qualified', earnedAt: '2026-01-01T00:00:00.000Z' });

      expect(result).toEqual({ ...responseBody, created: true, statusCode: 201 });
      expect(mockRequest).toHaveBeenCalledWith(
        expect.objectContaining({ method: 'POST', path: '/pilot_achievements' }),
        expect.any(Function)
      );
      expect(mockReq.write).toHaveBeenCalledWith(JSON.stringify({
        player_ucid: 'abc123',
        achievement_id: 'carrier_qualified',
        earned_at: '2026-01-01T00:00:00.000Z',
      }));
    });

    it('resolves with parsed JSON on 200 (idempotent duplicate)', async () => {
      const client = new APIClient(false, 'localhost', 3000);
      const responseBody = { id: 1, achievement_id: 'carrier_qualified' };

      mockResponse.statusCode = 200;
      mockResponse.on = jest.fn((event, handler) => {
        if (event === 'data') handler(Buffer.from(JSON.stringify(responseBody)));
        else if (event === 'end') handler();
      });

      const result = await client.saveAchievement({ playerUcid: 'abc123', achievementId: 'carrier_qualified', earnedAt: '2026-01-01T00:00:00.000Z' });
      expect(result).toEqual({ ...responseBody, created: false, statusCode: 200 });
    });

    it('rejects on non-200/201 status', async () => {
      const client = new APIClient(false, 'localhost', 3000);

      mockResponse.statusCode = 404;
      mockResponse.on = jest.fn((event, handler) => {
        if (event === 'data') handler(Buffer.from('Not Found'));
        else if (event === 'end') handler();
      });

      await expect(
        client.saveAchievement({ playerUcid: 'abc123', achievementId: 'carrier_qualified', earnedAt: '2026-01-01T00:00:00.000Z' })
      ).rejects.toThrow(APIClientError);
      await expect(
        client.saveAchievement({ playerUcid: 'abc123', achievementId: 'carrier_qualified', earnedAt: '2026-01-01T00:00:00.000Z' })
      ).rejects.toThrow('Failed to save achievement: Not Found');
    });

    it('includes bearer token when provided', async () => {
      jest.clearAllMocks();

      const client = new APIClient(false, 'localhost', 3000, 'secret');

      mockResponse.statusCode = 201;
      mockResponse.on = jest.fn((event, handler) => {
        if (event === 'data') handler(Buffer.from('{}'));
        else if (event === 'end') handler();
      });

      await client.saveAchievement({ playerUcid: 'abc123', achievementId: 'carrier_qualified', earnedAt: '2026-01-01T00:00:00.000Z' });

      const options = mockRequest.mock.calls[0][0];
      expect(options.headers['Authorization']).toBe('Bearer secret');
    });
  });

  describe('fetchPilotAchievements', () => {
    it('resolves with parsed JSON on 200', async () => {
      const client = new APIClient(false, 'localhost', 3000);
      const responseBody = { achievement_ids: ['carrier_qualified', 'night_qualified'] };

      mockResponse.statusCode = 200;
      mockResponse.on = jest.fn((event, handler) => {
        if (event === 'data') handler(Buffer.from(JSON.stringify(responseBody)));
        else if (event === 'end') handler();
      });

      const result = await client.fetchPilotAchievements('abc123');

      expect(result).toEqual(responseBody);
      expect(mockRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          method: 'GET',
          path: '/pilot_achievements?player_ucid=abc123',
        }),
        expect.any(Function)
      );
    });

    it('URL-encodes the player_ucid', async () => {
      jest.clearAllMocks();
      const client = new APIClient(false, 'localhost', 3000);

      mockResponse.statusCode = 200;
      mockResponse.on = jest.fn((event, handler) => {
        if (event === 'data') handler(Buffer.from('{"achievement_ids":[]}'));
        else if (event === 'end') handler();
      });

      await client.fetchPilotAchievements('ucid with spaces');

      const options = mockRequest.mock.calls[0][0];
      expect(options.path).toBe('/pilot_achievements?player_ucid=ucid%20with%20spaces');
    });

    it('rejects on non-200 status', async () => {
      const client = new APIClient(false, 'localhost', 3000);

      mockResponse.statusCode = 500;
      mockResponse.on = jest.fn((event, handler) => {
        if (event === 'data') handler(Buffer.from('Server Error'));
        else if (event === 'end') handler();
      });

      await expect(client.fetchPilotAchievements('abc123')).rejects.toThrow(APIClientError);
      await expect(client.fetchPilotAchievements('abc123')).rejects.toThrow('Failed to fetch pilot achievements: Server Error');
    });

    it('rejects when response body cannot be parsed', async () => {
      const client = new APIClient(false, 'localhost', 3000);

      mockResponse.statusCode = 200;
      mockResponse.on = jest.fn((event, handler) => {
        if (event === 'data') handler(Buffer.from('not json'));
        else if (event === 'end') handler();
      });

      await expect(client.fetchPilotAchievements('abc123')).rejects.toThrow(APIClientError);
      await expect(client.fetchPilotAchievements('abc123')).rejects.toThrow('Failed to parse fetch pilot achievements response');
    });

    it('includes bearer token when provided', async () => {
      jest.clearAllMocks();

      const client = new APIClient(false, 'localhost', 3000, 'secret');

      mockResponse.statusCode = 200;
      mockResponse.on = jest.fn((event, handler) => {
        if (event === 'data') handler(Buffer.from('{"achievement_ids":[]}'));
        else if (event === 'end') handler();
      });

      await client.fetchPilotAchievements('abc123');

      const options = mockRequest.mock.calls[0][0];
      expect(options.headers['Authorization']).toBe('Bearer secret');
    });
  });

  describe('fetchPilotGauges', () => {
    it('resolves with parsed JSON on 200', async () => {
      const client = new APIClient(false, 'localhost', 3000);
      const responseBody = { gauges: [{ gauge_id: 'highest_speed_kts', value: 650 }] };

      mockResponse.statusCode = 200;
      mockResponse.on = jest.fn((event, handler) => {
        if (event === 'data') handler(Buffer.from(JSON.stringify(responseBody)));
        else if (event === 'end') handler();
      });

      await expect(client.fetchPilotGauges('abc123')).resolves.toEqual(responseBody);
      expect(mockRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          method: 'GET',
          path: '/pilot_gauges?player_ucid=abc123',
        }),
        expect.any(Function)
      );
    });

    it('rejects on non-200 status', async () => {
      const client = new APIClient(false, 'localhost', 3000);

      mockResponse.statusCode = 500;
      mockResponse.on = jest.fn((event, handler) => {
        if (event === 'data') handler(Buffer.from('Server Error'));
        else if (event === 'end') handler();
      });

      await expect(client.fetchPilotGauges('abc123')).rejects.toThrow('Failed to fetch pilot gauges: Server Error');
    });

    it('rejects when response body cannot be parsed', async () => {
      const client = new APIClient(false, 'localhost', 3000);

      mockResponse.statusCode = 200;
      mockResponse.on = jest.fn((event, handler) => {
        if (event === 'data') handler(Buffer.from('not json'));
        else if (event === 'end') handler();
      });

      await expect(client.fetchPilotGauges('abc123')).rejects.toThrow('Failed to parse fetch pilot gauges response');
    });
  });

  describe('updatePilotGauge', () => {
    it('sends PATCH and resolves parsed JSON body on 200', async () => {
      const client = new APIClient(false, 'localhost', 3000, 'secret');
      const responseBody = { updated: true, value: 2.1 };

      mockResponse.statusCode = 200;
      mockResponse.on = jest.fn((event, handler) => {
        if (event === 'data') handler(Buffer.from(JSON.stringify(responseBody)));
        else if (event === 'end') handler();
      });

      const payload = {
        playerUcid: 'abc123',
        playerName: 'Maverick',
        gaugeId: 'highest_speed_mach',
        value: 2.1,
        comparison: 'max',
      };

      await expect(client.updatePilotGauge(payload)).resolves.toEqual(responseBody);

      expect(mockRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          method: 'PATCH',
          path: '/pilot_gauges/highest_speed_mach',
          headers: expect.objectContaining({
            Authorization: 'Bearer secret',
            'Content-Type': 'application/json',
          }),
        }),
        expect.any(Function)
      );

      expect(mockReq.write).toHaveBeenCalledWith(JSON.stringify({
        player_ucid: 'abc123',
        player_name: 'Maverick',
        value: 2.1,
        comparison: 'max',
      }));
    });

    it('resolves with empty object when response body is empty', async () => {
      const client = new APIClient(false, 'localhost', 3000);

      mockResponse.statusCode = 200;
      mockResponse.on = jest.fn((event, handler) => {
        if (event === 'end') handler();
      });

      await expect(client.updatePilotGauge({
        playerUcid: 'abc123',
        playerName: 'Maverick',
        gaugeId: 'highest_altitude_ft',
        value: 50000,
      })).resolves.toEqual({});
    });

    it('rejects on non-200 status', async () => {
      const client = new APIClient(false, 'localhost', 3000);

      mockResponse.statusCode = 404;
      mockResponse.on = jest.fn((event, handler) => {
        if (event === 'data') handler(Buffer.from('Not Found'));
        else if (event === 'end') handler();
      });

      await expect(client.updatePilotGauge({
        playerUcid: 'abc123',
        playerName: 'Maverick',
        gaugeId: 'missing',
        value: 1,
      })).rejects.toThrow('Failed to update pilot gauge: Not Found');
    });

    it('rejects when response body is invalid JSON', async () => {
      const client = new APIClient(false, 'localhost', 3000);

      mockResponse.statusCode = 200;
      mockResponse.on = jest.fn((event, handler) => {
        if (event === 'data') handler(Buffer.from('{invalid'));
        else if (event === 'end') handler();
      });

      await expect(client.updatePilotGauge({
        playerUcid: 'abc123',
        playerName: 'Maverick',
        gaugeId: 'highest_speed_kts',
        value: 650,
      })).rejects.toThrow('Failed to parse update pilot gauge response');
    });
  });

  describe('publishPilotState', () => {
    it('resolves parsed payload on 202', async () => {
      const client = new APIClient(false, 'localhost', 3000);
      const responseBody = { queued: true };

      mockResponse.statusCode = 202;
      mockResponse.on = jest.fn((event, handler) => {
        if (event === 'data') handler(Buffer.from(JSON.stringify(responseBody)));
        else if (event === 'end') handler();
      });

      await expect(client.publishPilotState({ speed: 500 })).resolves.toEqual(responseBody);
      expect(mockRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          method: 'POST',
          path: '/pilot_state_updates',
        }),
        expect.any(Function)
      );
      expect(mockReq.write).toHaveBeenCalledWith(JSON.stringify({ pilot_state_update: { speed: 500 } }));
    });

    it('resolves with fallback object for 200 empty body', async () => {
      const client = new APIClient(false, 'localhost', 3000);

      mockResponse.statusCode = 200;
      mockResponse.on = jest.fn((event, handler) => {
        if (event === 'end') handler();
      });

      await expect(client.publishPilotState({ fuel: 2000 })).resolves.toEqual({ ok: true });
    });

    it('resolves with fallback object for invalid JSON body', async () => {
      const client = new APIClient(false, 'localhost', 3000);

      mockResponse.statusCode = 200;
      mockResponse.on = jest.fn((event, handler) => {
        if (event === 'data') handler(Buffer.from('not-json'));
        else if (event === 'end') handler();
      });

      await expect(client.publishPilotState({ fuel: 2000 })).resolves.toEqual({ ok: true });
    });

    it('rejects on non-200/202 status', async () => {
      const client = new APIClient(false, 'localhost', 3000);

      mockResponse.statusCode = 503;
      mockResponse.on = jest.fn((event, handler) => {
        if (event === 'data') handler(Buffer.from('Service Unavailable'));
        else if (event === 'end') handler();
      });

      await expect(client.publishPilotState({ speed: 500 })).rejects.toThrow('Failed to publish pilot state: Service Unavailable');
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
