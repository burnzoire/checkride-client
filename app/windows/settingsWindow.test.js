const path = require('path');

describe('settingsWindow', () => {
  function loadModule() {
    return require('./settingsWindow');
  }

  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
  });

  it('creates a BrowserWindow and loads the settings page', () => {
    const { showSettingsWindow, getSettingsWindow } = loadModule();
    const { BrowserWindow } = require('electron');

    const returnedWindow = showSettingsWindow();

    expect(BrowserWindow).toHaveBeenCalledTimes(1);
    const windowOptions = BrowserWindow.mock.calls[0][0];
    expect(windowOptions).toMatchObject({
      width: 420,
      height: 520,
      resizable: false,
      minimizable: false,
      maximizable: false,
      show: false,
      title: 'Settings',
      autoHideMenuBar: true,
    });
    expect(windowOptions.webPreferences.preload).toBe(
      path.join(__dirname, '../preload.js')
    );
    expect(windowOptions.webPreferences).toMatchObject({
      contextIsolation: true,
      nodeIntegration: false,
    });

    const instance = BrowserWindow.mock.results[0].value;
    expect(instance.loadFile).toHaveBeenCalledWith(
      path.join(__dirname, 'settings.html')
    );
    expect(instance.once).toHaveBeenCalledWith('ready-to-show', expect.any(Function));
    expect(instance.on).toHaveBeenCalledWith('closed', expect.any(Function));

    const readyHandler = instance.once.mock.calls.find(([event]) => event === 'ready-to-show')[1];
    instance.show.mockClear();
    readyHandler();
    expect(instance.show).toHaveBeenCalled();

    expect(returnedWindow).toBe(instance);
    expect(instance.focus).toHaveBeenCalled();
    expect(getSettingsWindow()).toBe(instance);
  });

  it('reuses an existing window that is not destroyed', () => {
    const { showSettingsWindow } = loadModule();
    const { BrowserWindow } = require('electron');

    const firstWindow = showSettingsWindow();
    firstWindow.isDestroyed.mockReturnValue(false);
    expect(BrowserWindow).toHaveBeenCalledTimes(1);

    const secondWindow = showSettingsWindow();
    expect(BrowserWindow).toHaveBeenCalledTimes(1);
    expect(secondWindow).toBe(firstWindow);
  });

  it('creates a new window when the previous instance is destroyed', () => {
    const { showSettingsWindow } = loadModule();
    const { BrowserWindow } = require('electron');

    const firstWindow = showSettingsWindow();
    firstWindow.isDestroyed.mockReturnValue(true);

    const secondWindow = showSettingsWindow();

    expect(BrowserWindow).toHaveBeenCalledTimes(2);
    expect(secondWindow).not.toBe(firstWindow);
  });

  it('restores a minimized window before focusing', () => {
    const { showSettingsWindow } = loadModule();
    const { BrowserWindow } = require('electron');
    const currentWindow = showSettingsWindow();

    currentWindow.isDestroyed.mockReturnValue(false);
    currentWindow.isMinimized.mockReturnValue(true);
    currentWindow.restore.mockClear();
    currentWindow.focus.mockClear();

    const returnedWindow = showSettingsWindow();

    expect(currentWindow.restore).toHaveBeenCalled();
    expect(currentWindow.focus).toHaveBeenCalled();
    expect(returnedWindow).toBe(currentWindow);
  });

  it('creates a new window after the existing one is closed', () => {
    const { showSettingsWindow, getSettingsWindow } = loadModule();
    const { BrowserWindow } = require('electron');

    const firstWindow = showSettingsWindow();
    firstWindow.isDestroyed.mockReturnValue(false);
    const closedHandler = firstWindow.on.mock.calls.find(([event]) => event === 'closed')[1];

    closedHandler();
    expect(getSettingsWindow()).toBeNull();

    const secondWindow = showSettingsWindow();
    expect(BrowserWindow).toHaveBeenCalledTimes(2);
    expect(secondWindow).not.toBe(firstWindow);
  });
});
