const { APIClient, APIClientError, APISaveEventError, APIPingError } = require('./apiClient');
const nock = require('nock');

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

  describe('ping', () => {
    it('handles successful ping response', async () => {
      const responseBody = { message: 'Pong!' };

      nock(`http://${host}:${port}`)
        .get('/ping')
        .reply(200, responseBody);

      const response = await client.ping();

      expect(response).toEqual(responseBody);
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
  });
});
