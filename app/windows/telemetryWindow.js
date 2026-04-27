const path = require('path');
const { BrowserWindow } = require('electron');

let telemetryWindow = null;

function createTelemetryWindow() {
  if (telemetryWindow && !telemetryWindow.isDestroyed()) {
    return telemetryWindow;
  }

  telemetryWindow = new BrowserWindow({
    width: 960,
    height: 640,
    minWidth: 600,
    minHeight: 400,
    show: false,
    title: 'Pilot Telemetry',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, '../preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  telemetryWindow.once('ready-to-show', () => {
    telemetryWindow.show();
  });

  telemetryWindow.on('closed', () => {
    telemetryWindow = null;
  });

  telemetryWindow.loadFile(path.join(__dirname, 'telemetry.html'));

  return telemetryWindow;
}

function showTelemetryWindow() {
  const window = createTelemetryWindow();
  if (window.isMinimized()) {
    window.restore();
  }
  window.focus();
  return window;
}

function getTelemetryWindow() {
  return telemetryWindow;
}

module.exports = {
  showTelemetryWindow,
  getTelemetryWindow,
};
