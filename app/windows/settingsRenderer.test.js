/** @jest-environment jsdom */

describe('settingsRenderer', () => {
  const defaultConfig = {
    server_host: 'example.com',
    server_port: '8080',
    use_ssl: true,
    udp_port: 41235,
    discord_webhook_path: '/hook',
    api_token: 'token',
  };

  let loadMock;
  let saveMock;
  let closeMock;
  let originalClose;

  const flushPromises = async () => {
    await Promise.resolve();
    await Promise.resolve();
  };

  function buildDom() {
    document.body.innerHTML = [
      '<form id="settings-form">',
      '  <input id="server_host" name="server_host" type="text" />',
      '  <input id="server_port" name="server_port" type="text" />',
      '  <input id="use_ssl" name="use_ssl" type="checkbox" />',
      '  <input id="udp_port" name="udp_port" type="number" />',
      '  <input id="discord_webhook_path" name="discord_webhook_path" type="text" />',
      '  <input id="api_token" name="api_token" type="text" />',
      '  <button id="cancel-button" type="button">Cancel</button>',
      '  <button type="submit">Save</button>',
      '</form>',
    ].join('');
  }

  async function loadModule() {
    jest.isolateModules(() => {
      require('./settingsRenderer');
    });
    await flushPromises();
  }

  beforeEach(() => {
    jest.resetModules();
    buildDom();

    loadMock = jest.fn().mockResolvedValue(defaultConfig);
    saveMock = jest.fn().mockResolvedValue({ success: true });
    closeMock = jest.fn();

    originalClose = window.close;
    window.settings = {
      load: loadMock,
      save: saveMock,
    };
    window.close = closeMock;
  });

  afterEach(() => {
    delete window.settings;
    window.close = originalClose;
  });

  it('loads configuration on start and populates the form', async () => {
    await loadModule();

    expect(loadMock).toHaveBeenCalled();
    expect(document.getElementById('server_host').value).toBe('example.com');
    expect(document.getElementById('server_port').value).toBe('8080');
    expect(document.getElementById('use_ssl').checked).toBe(true);
    expect(document.getElementById('udp_port').value).toBe('41235');
    expect(document.getElementById('discord_webhook_path').value).toBe('/hook');
    expect(document.getElementById('api_token').value).toBe('token');
  });

  it('submits updated configuration and closes the window', async () => {
    await loadModule();

    const form = document.getElementById('settings-form');
    document.getElementById('server_host').value = '  new.host ';
    document.getElementById('server_port').value = ' 9000 ';
    document.getElementById('use_ssl').checked = false;
    document.getElementById('udp_port').value = '45000';
    document.getElementById('discord_webhook_path').value = ' /new ';
    document.getElementById('api_token').value = ' secret ';

    form.dispatchEvent(new Event('submit', { cancelable: true }));
    await flushPromises();

    expect(saveMock).toHaveBeenCalledWith({
      server_host: 'new.host',
      server_port: '9000',
      use_ssl: false,
      udp_port: 45000,
      discord_webhook_path: '/new',
      api_token: 'secret',
    });
    expect(closeMock).toHaveBeenCalled();
  });

  it('closes the window when cancel is clicked', async () => {
    await loadModule();

    closeMock.mockClear();
    document.getElementById('cancel-button').click();

    expect(closeMock).toHaveBeenCalled();
  });

  it('closes the window when Escape is pressed', async () => {
    await loadModule();

    closeMock.mockClear();
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));

    expect(closeMock).toHaveBeenCalled();
  });

  it('logs an error when loading configuration fails', async () => {
    const error = new Error('load failed');
    loadMock.mockRejectedValueOnce(error);

    await loadModule();

    expect(console.error).toHaveBeenCalledWith('Failed to load settings', error);
  });

  it('logs an error when saving configuration fails', async () => {
    const error = new Error('save failed');
    saveMock.mockRejectedValueOnce(error);

    await loadModule();

    document.getElementById('server_host').value = 'example.com';
    document.getElementById('server_port').value = '3000';
    document.getElementById('udp_port').value = '45000';

    console.error.mockClear();
    closeMock.mockClear();

    document.getElementById('settings-form').dispatchEvent(new Event('submit', { cancelable: true }));
    await flushPromises();

    expect(console.error).toHaveBeenCalledWith('Failed to save settings', error);
    expect(closeMock).not.toHaveBeenCalled();
  });

  it('handles missing form inputs gracefully', async () => {
    document.body.innerHTML = [
      '<form id="settings-form">',
      '  <button id="cancel-button" type="button">Cancel</button>',
      '  <button type="submit">Save</button>',
      '</form>',
    ].join('');

    await loadModule();

    document.getElementById('settings-form').dispatchEvent(new Event('submit', { cancelable: true }));
    await flushPromises();

    expect(saveMock).toHaveBeenCalledWith({
      server_host: '',
      server_port: '',
      use_ssl: false,
      udp_port: 0,
      discord_webhook_path: '',
      api_token: '',
    });
    expect(closeMock).toHaveBeenCalled();
  });
});
