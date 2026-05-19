const path = require('path');

describe('telemetryWindow', () => {
  function loadModule() {
    return require('./telemetryWindow');
  }

  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
  });

  it('creates a BrowserWindow and loads the telemetry page', () => {
    const { showTelemetryWindow, getTelemetryWindow } = loadModule();
    const { BrowserWindow } = require('electron');

    const returnedWindow = showTelemetryWindow();

    expect(BrowserWindow).toHaveBeenCalledTimes(1);
    const windowOptions = BrowserWindow.mock.calls[0][0];
    expect(windowOptions).toMatchObject({
      width: 960,
      height: 640,
      minWidth: 600,
      minHeight: 400,
      show: false,
      title: 'Pilot Telemetry',
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
      path.join(__dirname, 'telemetry.html')
    );
    expect(instance.once).toHaveBeenCalledWith('ready-to-show', expect.any(Function));
    expect(instance.on).toHaveBeenCalledWith('closed', expect.any(Function));

    const readyHandler = instance.once.mock.calls.find(([event]) => event === 'ready-to-show')[1];
    instance.show.mockClear();
    readyHandler();
    expect(instance.show).toHaveBeenCalled();

    expect(returnedWindow).toBe(instance);
    expect(instance.focus).toHaveBeenCalled();
    expect(getTelemetryWindow()).toBe(instance);
  });

  it('reuses an existing window that is not destroyed', () => {
    const { showTelemetryWindow } = loadModule();
    const { BrowserWindow } = require('electron');

    const firstWindow = showTelemetryWindow();
    firstWindow.isDestroyed.mockReturnValue(false);
    expect(BrowserWindow).toHaveBeenCalledTimes(1);

    const secondWindow = showTelemetryWindow();
    expect(BrowserWindow).toHaveBeenCalledTimes(1);
    expect(secondWindow).toBe(firstWindow);
  });

  it('creates a new window when the previous instance is destroyed', () => {
    const { showTelemetryWindow } = loadModule();
    const { BrowserWindow } = require('electron');

    const firstWindow = showTelemetryWindow();
    firstWindow.isDestroyed.mockReturnValue(true);

    const secondWindow = showTelemetryWindow();

    expect(BrowserWindow).toHaveBeenCalledTimes(2);
    expect(secondWindow).not.toBe(firstWindow);
  });

  it('restores a minimized window before focusing', () => {
    const { showTelemetryWindow } = loadModule();
    const { BrowserWindow } = require('electron');
    const currentWindow = showTelemetryWindow();

    currentWindow.isDestroyed.mockReturnValue(false);
    currentWindow.isMinimized.mockReturnValue(true);
    currentWindow.restore.mockClear();
    currentWindow.focus.mockClear();

    const returnedWindow = showTelemetryWindow();

    expect(currentWindow.restore).toHaveBeenCalled();
    expect(currentWindow.focus).toHaveBeenCalled();
    expect(returnedWindow).toBe(currentWindow);
  });

  it('creates a new window after the existing one is closed', () => {
    const { showTelemetryWindow, getTelemetryWindow } = loadModule();
    const { BrowserWindow } = require('electron');

    const firstWindow = showTelemetryWindow();
    firstWindow.isDestroyed.mockReturnValue(false);
    const closedHandler = firstWindow.on.mock.calls.find(([event]) => event === 'closed')[1];

    closedHandler();
    expect(getTelemetryWindow()).toBeNull();

    const secondWindow = showTelemetryWindow();
    expect(BrowserWindow).toHaveBeenCalledTimes(2);
    expect(secondWindow).not.toBe(firstWindow);
  });

  it('getTelemetryWindow returns null before any window is created', () => {
    const { getTelemetryWindow } = loadModule();
    expect(getTelemetryWindow()).toBeNull();
  });
});
