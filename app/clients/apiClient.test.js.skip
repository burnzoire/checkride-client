const { APIClient, APIClientError, APISaveEventError, APIPingError } = require('./apiClient');
const { Readable } = require('stream');
const http = require('http');
const https = require('https');
const nock = require('nock');
const httpPort = 80;
const httpsPort = 443;

describe('APIClient', () => {
  let client;
  const host = 'api.example.com';
  const port = 80;

  beforeEach(() => {
    client = new APIClient(false, host, port);
  });

  afterEach(() => {
    nock.cleanAll();
    jest.restoreAllMocks();
  });


  describe('constructor', () => {
    it('uses http module when useSsl is false', () => {
      const client = new APIClient(false, host, httpPort);
      expect(client.httpModule).toBe(http);
    });

    it('uses https module when useSsl is true', () => {
      const client = new APIClient(true, host, httpsPort);
      expect(client.httpModule).toBe(https);
    });
  });

  describe('ping', () => {
    it('handles successful ping response', async () => {
      const responseBody = { message: 'Pong!' };

      nock(`http://${host}:${port}`)
        .get('/ping')
        .reply(200, responseBody);

      const response = await client.ping();

      expect(response).toEqual(responseBody);
    });

    it('uses http module when useSsl is false', async () => {
      client = new APIClient(false, host, httpPort);
      const spyRequest = jest.spyOn(http, 'request');

      nock(`http://${host}:${httpPort}`)
        .get('/ping')
        .reply(200, { message: 'Pong!' });

      await client.ping();

      expect(spyRequest).toHaveBeenCalledTimes(1);
    });

    it('uses https module when useSsl is true', async () => {
      client = new APIClient(true, host, httpsPort);
      const spyRequest = jest.spyOn(https, 'request');

      nock(`https://${host}:${httpsPort}`)
        .get('/ping')
        .reply(200, { message: 'Pong!' });

      await client.ping();

      expect(spyRequest).toHaveBeenCalledTimes(1);
    });

    it('handles non-JSON response from ping', async () => {
      nock(`http://${host}:${port}`)
        .get('/ping')
        .reply(200, 'not json');

      await expect(client.ping()).rejects.toThrow(APIPingError);
    });

    it('throws an error when ping API request encounters an error', async () => {
      nock(`http://${host}:${port}`)
        .get('/ping')
        .reply(500);

      await expect(client.ping()).rejects.toThrow(APIPingError);
    });

    it('handles response error', async () => {
      const erroringStream = new Readable();
      erroringStream._read = () => {
        process.nextTick(() => erroringStream.emit('error', new Error('Response error')));
      };

      nock(`http://${host}:${port}`)
        .get('/ping')
        .reply(200, erroringStream);

      await expect(client.ping()).rejects.toThrow(APIClientError);
    });

    it('throws an APIClientError when ping request encounters an error', async () => {
      const mockError = new Error('request error');
      const payload = { type: 'test', data: '123' };

      nock(`http://${host}:${port}`)
        .get('/ping')
        .replyWithError(mockError);

      await expect(client.ping()).rejects.toEqual(new APIClientError(`API request failed: ${mockError}`));
    });
  });

  describe('saveEvent', () => {

    it('sends event and handles successful response', async () => {
      const eventData = { event: 'test' };
      const responseBody = { id: 1, summary: 'event summary', publish: true };

      nock(`http://${host}:${port}`)
        .post('/events', eventData)
        .reply(201, responseBody);

      const response = await client.saveEvent(eventData);

      expect(response).toEqual(responseBody);
    });


    it('handles non-JSON response from saveEvent', async () => {
      const eventData = { event: 'test' };

      nock(`http://${host}:${port}`)
        .post('/events', eventData)
        .reply(201, 'not json');

      await expect(client.saveEvent(eventData)).rejects.toThrow(APIClientError);
    });

    it('sends correct request when saveEvent is called', async () => {
      const payload = { type: 'test', data: '123' };
      const response = { success: true };
      nock(`http://${host}:${port}`)
        .post('/events', payload)
        .reply(201, response);

      const result = await client.saveEvent(payload);

      expect(result).toEqual(response);
    });

    it('throws an error when API request fails', async () => {
      const payload = { type: 'test', data: '123' };
      nock(`http://${host}:${port}`)
        .post('/events', payload)
        .reply(500, 'Server Error');

      await expect(client.saveEvent(payload)).rejects.toThrow(APIClientError);
    });

    it('throws an error when API response cannot be parsed', async () => {
      const payload = { type: 'test', data: '123' };
      const invalidResponse = "this is not json";

      nock(`http://${host}:${port}`)
        .post('/events', payload)
        .reply(400, invalidResponse);

      await expect(client.saveEvent(payload)).rejects.toThrow(APISaveEventError);
    });

    it('handles response error', async () => {
      const eventData = { event: 'test' };

      const erroringStream = new Readable();
      erroringStream._read = () => {
        process.nextTick(() => erroringStream.emit('error', new Error('Response error')));
      };

      nock(`http://${host}:${port}`)
        .post('/events', eventData)
        .reply(204, erroringStream);

      await expect(client.saveEvent(eventData)).rejects.toThrow(APIClientError);
    });

    it('throws an APIClientError when saveEvent request encounters an error', async () => {
      const mockError = new Error('request error');
      const payload = { type: 'test', data: '123' };

      nock(`http://${host}:${port}`)
        .post('/events', payload)
        .replyWithError(mockError);

      await expect(client.saveEvent(payload)).rejects.toEqual(new APIClientError(`API request failed: ${mockError}`));
    });

  });
});
