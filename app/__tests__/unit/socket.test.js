/**
 * Tests for socket.js core functionality
 */

const {
  createMockHttpRequest,
  createMockHttpResponse,
  createMockStore
} = require('../helpers/mocks');

const eventFixtures = require('../fixtures/events');

// Mock modules before importing
jest.mock('dgram');
jest.mock('http');
jest.mock('https');

const dgram = require('dgram');
const http = require('http');
const https = require('https');

describe('socket.js - Core Functions', () => {
  let mockStore;

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Setup default mock store
    mockStore = createMockStore({
      server_host: 'localhost',
      server_port: '3000',
      use_ssl: false,
      discord_webhook_path: ''
    });
  });

  // Note: initializeStore tests removed - this happens at module load in socket.js

  describe('ping', () => {
    it('should successfully ping server and resolve with response', async () => {
      const { ping } = require('../../socket');
      
      const mockResponse = createMockHttpResponse();
      const mockRequest = createMockHttpRequest();
      
      http.request = jest.fn((options, callback) => {
        callback(mockResponse);
        return mockRequest;
      });

      const pingPromise = ping(mockStore, http);

      // Simulate response
      const responseData = { message: 'pong' };
      mockResponse._triggerData(Buffer.from(JSON.stringify(responseData)));
      mockResponse._triggerEnd();

      const result = await pingPromise;
      
      expect(result).toEqual(responseData);
      expect(http.request).toHaveBeenCalledWith(
        expect.objectContaining({
          host: 'localhost',
          port: '3000',
          path: '/ping',
          method: 'GET'
        }),
        expect.any(Function)
      );
    });

    it('should reject on network error', async () => {
      const { ping } = require('../../socket');
      
      const mockRequest = createMockHttpRequest();
      
      http.request = jest.fn(() => mockRequest);

      const pingPromise = ping(mockStore, http);

      // Simulate error
      const error = new Error('Network error');
      mockRequest._triggerEvent('error', error);

      await expect(pingPromise).rejects.toThrow('Network error');
    });

    it('should reject on invalid JSON response', async () => {
      const { ping } = require('../../socket');
      
      const mockResponse = createMockHttpResponse();
      const mockRequest = createMockHttpRequest();
      
      http.request = jest.fn((options, callback) => {
        callback(mockResponse);
        return mockRequest;
      });

      const pingPromise = ping(mockStore, http);

      // Simulate invalid JSON
      mockResponse._triggerData(Buffer.from('not valid json'));
      mockResponse._triggerEnd();

      await expect(pingPromise).rejects.toThrow();
    });

    it('should use HTTPS when use_ssl is true', async () => {
      const { ping } = require('../../socket');
      
      const sslStore = createMockStore({
        server_host: 'secure.example.com',
        server_port: '443',
        use_ssl: true,
        discord_webhook_path: ''
      });

      const mockResponse = createMockHttpResponse();
      const mockRequest = createMockHttpRequest();
      
      https.request = jest.fn((options, callback) => {
        callback(mockResponse);
        return mockRequest;
      });

      const pingPromise = ping(sslStore, https);

      mockResponse._triggerData(Buffer.from(JSON.stringify({ message: 'pong' })));
      mockResponse._triggerEnd();

      await pingPromise;

      expect(https.request).toHaveBeenCalled();
    });
  });

  describe('sendToDiscord', () => {
    it('should skip sending when publish is false', async () => {
      const { sendToDiscord } = require('../../socket');
      
      const result = await sendToDiscord('test message', false, mockStore);
      
      expect(result).toBeUndefined();
      expect(https.request).not.toHaveBeenCalled();
    });

    it('should skip sending when webhook path is empty', async () => {
      const { sendToDiscord } = require('../../socket');
      
      const result = await sendToDiscord('test message', true, mockStore);
      
      expect(result).toBeUndefined();
      expect(https.request).not.toHaveBeenCalled();
    });

    it('should send message to Discord when webhook is configured', async () => {
      const { sendToDiscord } = require('../../socket');
      
      const webhookStore = createMockStore({
        server_host: 'localhost',
        server_port: '3000',
        use_ssl: false,
        discord_webhook_path: '/api/webhooks/123456/abcdef'
      });

      const mockResponse = createMockHttpResponse();
      const mockRequest = createMockHttpRequest();
      
      https.request = jest.fn((options, callback) => {
        callback(mockResponse);
        return mockRequest;
      });

      const sendPromise = sendToDiscord('test message', true, webhookStore);

      mockResponse._triggerEnd();

      await sendPromise;

      expect(https.request).toHaveBeenCalledWith(
        expect.objectContaining({
          host: 'discord.com',
          path: '/api/webhooks/123456/abcdef',
          method: 'POST'
        }),
        expect.any(Function)
      );
      
      expect(mockRequest.write).toHaveBeenCalled();
      const writtenData = mockRequest.write.mock.calls[0][0];
      const decodedData = JSON.parse(new TextDecoder().decode(writtenData));
      expect(decodedData.content).toBe('test message');
    });

    it('should reject on Discord API error', async () => {
      const { sendToDiscord } = require('../../socket');
      
      const webhookStore = createMockStore({
        server_host: 'localhost',
        server_port: '3000',
        use_ssl: false,
        discord_webhook_path: '/api/webhooks/123456/abcdef'
      });

      const mockRequest = createMockHttpRequest();
      
      https.request = jest.fn(() => mockRequest);

      const sendPromise = sendToDiscord('test message', true, webhookStore);

      const error = new Error('Discord API error');
      mockRequest._triggerEvent('error', error);

      await expect(sendPromise).rejects.toThrow('Discord API error');
    });
  });

  describe('sendEventToServer', () => {
    it('should successfully send event to server', async () => {
      const { sendEventToServer } = require('../../socket');
      
      const mockResponse = createMockHttpResponse();
      const mockRequest = createMockHttpRequest();
      
      http.request = jest.fn((options, callback) => {
        callback(mockResponse);
        return mockRequest;
      });

      const payload = new TextEncoder().encode(JSON.stringify({ test: 'data' }));
      const sendPromise = sendEventToServer(payload, '/events', mockStore, http);

      const responseData = { 
        summary: 'Event saved', 
        awards: [], 
        publish: true 
      };
      mockResponse._triggerData(Buffer.from(JSON.stringify(responseData)));
      mockResponse._triggerEnd();

      const result = await sendPromise;

      expect(result).toEqual(responseData);
      expect(http.request).toHaveBeenCalledWith(
        expect.objectContaining({
          host: 'localhost',
          port: '3000',
          path: '/events',
          method: 'POST',
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
            'Content-Length': payload.length
          })
        }),
        expect.any(Function)
      );
      expect(mockRequest.write).toHaveBeenCalledWith(payload);
    });

    it('should reject on server error', async () => {
      const { sendEventToServer } = require('../../socket');
      
      const mockRequest = createMockHttpRequest();
      
      http.request = jest.fn(() => mockRequest);

      const payload = new TextEncoder().encode(JSON.stringify({ test: 'data' }));
      const sendPromise = sendEventToServer(payload, '/events', mockStore, http);

      const error = new Error('Server error');
      mockRequest._triggerEvent('error', error);

      await expect(sendPromise).rejects.toThrow('Server error');
    });

    it('should handle empty payload', async () => {
      const { sendEventToServer } = require('../../socket');
      
      const mockResponse = createMockHttpResponse();
      const mockRequest = createMockHttpRequest();
      
      http.request = jest.fn((options, callback) => {
        callback(mockResponse);
        return mockRequest;
      });

      const sendPromise = sendEventToServer(null, '/events', mockStore, http);

      mockResponse._triggerData(Buffer.from(JSON.stringify({ success: true })));
      mockResponse._triggerEnd();

      await sendPromise;

      expect(mockRequest.write).not.toHaveBeenCalled();
    });
  });

  describe('transformEventToGameEvent', () => {
    const { transformEventToGameEvent } = require('../../socket');

    it('should transform kill event correctly', () => {
      const result = transformEventToGameEvent(eventFixtures.killEvent);
      expect(result).toEqual(eventFixtures.expectedGameEvent.kill);
    });

    it('should transform takeoff event correctly', () => {
      const result = transformEventToGameEvent(eventFixtures.takeoffEvent);
      expect(result).toEqual(eventFixtures.expectedGameEvent.takeoff);
    });

    it('should transform landing event correctly', () => {
      const result = transformEventToGameEvent(eventFixtures.landingEvent);
      expect(result).toEqual(eventFixtures.expectedGameEvent.landing);
    });

    it('should transform crash event correctly', () => {
      const result = transformEventToGameEvent(eventFixtures.crashEvent);
      expect(result).toEqual(eventFixtures.expectedGameEvent.crash);
    });

    it('should transform eject event correctly', () => {
      const result = transformEventToGameEvent(eventFixtures.ejectEvent);
      expect(result).toEqual(eventFixtures.expectedGameEvent.eject);
    });

    it('should transform pilot_death event correctly', () => {
      const result = transformEventToGameEvent(eventFixtures.pilotDeathEvent);
      expect(result).toEqual(eventFixtures.expectedGameEvent.pilotDeath);
    });

    it('should transform self_kill event correctly', () => {
      const result = transformEventToGameEvent(eventFixtures.selfKillEvent);
      expect(result).toEqual(eventFixtures.expectedGameEvent.selfKill);
    });

    it('should transform connect event correctly', () => {
      const result = transformEventToGameEvent(eventFixtures.connectEvent);
      expect(result).toEqual(eventFixtures.expectedGameEvent.connect);
    });

    it('should transform disconnect event correctly', () => {
      const result = transformEventToGameEvent(eventFixtures.disconnectEvent);
      expect(result).toEqual(eventFixtures.expectedGameEvent.disconnect);
    });

    it('should transform change_slot event correctly', () => {
      const result = transformEventToGameEvent(eventFixtures.changeSlotEvent);
      expect(result).toEqual(eventFixtures.expectedGameEvent.changeSlot);
    });
  });
});
