// Test setup file
// This file runs before all tests

// Mock electron modules
jest.mock('electron', () => {
  const app = {
    whenReady: jest.fn(() => Promise.resolve()),
    on: jest.fn(),
    quit: jest.fn(),
    dock: {
      hide: jest.fn(),
    },
  };

  const BrowserWindow = jest.fn().mockImplementation(() => {
    const instance = {
      loadFile: jest.fn(),
      getAllWindows: jest.fn(() => []),
      once: jest.fn(),
      on: jest.fn(),
      show: jest.fn(),
      focus: jest.fn(),
      restore: jest.fn(),
      isDestroyed: jest.fn(() => false),
      isMinimized: jest.fn(() => false),
    };
    return instance;
  });

  const Menu = {
    buildFromTemplate: jest.fn(() => ({})),
    setApplicationMenu: jest.fn(),
  };

  const Tray = jest.fn().mockImplementation(() => ({
    setToolTip: jest.fn(),
    setContextMenu: jest.fn(),
  }));

  const globalShortcut = {
    register: jest.fn(),
  };

  const contextBridge = {
    exposeInMainWorld: jest.fn(),
  };

  const ipcRenderer = {
    invoke: jest.fn(),
  };

  const ipcMain = {
    handle: jest.fn(),
  };

  return {
    app,
    BrowserWindow,
    Menu,
    Tray,
    globalShortcut,
    contextBridge,
    ipcRenderer,
    ipcMain,
  };
});

// Mock electron-log
jest.mock('electron-log', () => ({
  info: jest.fn(),
  debug: jest.fn(),
  error: jest.fn(),
  warn: jest.fn()
}));

// Mock electron-store
jest.mock('electron-store', () => {
  return jest.fn().mockImplementation(() => ({
    has: jest.fn(() => false),
    get: jest.fn((key) => {
      const defaults = {
        'server_host': 'localhost',
        'server_port': '3000',
        'use_ssl': false,
        'server_tls': false,
        'api_token': '',
        'discord_webhook_path': ''
      };
      return defaults[key];
    }),
    set: jest.fn()
  }));
});

// Mock dgram (UDP sockets)
jest.mock('dgram', () => ({
  createSocket: jest.fn(() => ({
    on: jest.fn(),
    bind: jest.fn(),
    close: jest.fn(),
    send: jest.fn(),
    address: jest.fn(() => ({ address: 'localhost', port: 41234 }))
  }))
}));

// Mock http module
jest.mock('http', () => ({
  request: jest.fn()
}));

// Mock https module
jest.mock('https', () => ({
  request: jest.fn()
}));

// Suppress console output during tests unless DEBUG is set
if (!process.env.DEBUG) {
  global.console = {
    ...console,
    log: jest.fn(),
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  };
}
