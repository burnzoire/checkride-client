const { APIClient, APIClientError, APISaveEventError, APIPingError } = require('./apiClient');
const nock = require('nock');
const mockConsole = require('jest-mock-console');

describe('APIClient', () => {
  let client;
  const host = 'api.example.com';
  const port = 80;
  let restoreConsole;

  beforeAll(() => {
    // Silence the console logs during testing
    restoreConsole = mockConsole();
  });

  afterAll(() => {
    // Restore console logs after tests are done
    restoreConsole();
  });

  beforeEach(() => {
    client = new APIClient(false, host, port);
  });

  afterEach(() => {
    nock.cleanAll();
  });

  it('sends event and handles successful response', async () => {
    const eventData = { event: 'test' };
    const responseBody = { id: 1, summary: 'event summary', publish: true };

    nock(`http://${host}:${port}`)
      .post('/events', eventData)
      .reply(201, responseBody);

    const response = await client.saveEvent(eventData);

    expect(response).toEqual(responseBody);
  });

  it('handles error response from saveEvent', async () => {
    const eventData = { event: 'test' };
    const responseBody = { error: 'Something went wrong' };

    nock(`http://${host}:${port}`)
      .post('/events', eventData)
      .reply(400, responseBody);

    await expect(client.saveEvent(eventData)).rejects.toThrow(APISaveEventError);
  });

  it('handles non-JSON response from saveEvent', async () => {
    const eventData = { event: 'test' };

    nock(`http://${host}:${port}`)
      .post('/events', eventData)
      .reply(201, 'not json');

    await expect(client.saveEvent(eventData)).rejects.toThrow(APIClientError);
  });

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

  it('handles error response from ping', async () => {
    nock(`http://${host}:${port}`)
      .get('/ping')
      .reply(400);

    await expect(client.ping()).rejects.toThrow(APIPingError);
  });
});
