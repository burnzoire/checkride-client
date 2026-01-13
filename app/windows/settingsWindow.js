const path = require('path');
const { BrowserWindow } = require('electron');

let settingsWindow = null;

function createSettingsWindow() {
  if (settingsWindow && !settingsWindow.isDestroyed()) {
    return settingsWindow;
  }

  settingsWindow = new BrowserWindow({
    width: 420,
    height: 520,
    resizable: false,
    minimizable: false,
    maximizable: false,
    show: false,
    title: 'Settings',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, '../preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  settingsWindow.once('ready-to-show', () => {
    settingsWindow.show();
  });

  settingsWindow.on('closed', () => {
    settingsWindow = null;
  });

  settingsWindow.loadFile(path.join(__dirname, 'settings.html'));

  return settingsWindow;
}

function showSettingsWindow() {
  const window = createSettingsWindow();
  if (window.isMinimized()) {
    window.restore();
  }
  window.focus();
  return window;
}

function getSettingsWindow() {
  return settingsWindow;
}

module.exports = {
  showSettingsWindow,
  getSettingsWindow,
};
