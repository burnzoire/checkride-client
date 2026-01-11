// Test setup file
// This file runs before all tests

// Mock electron modules
jest.mock('electron', () => ({
  app: {
    whenReady: jest.fn(() => Promise.resolve()),
    on: jest.fn(),
    quit: jest.fn(),
    dock: {
      hide: jest.fn()
    }
  },
  BrowserWindow: jest.fn().mockImplementation(() => ({
    loadFile: jest.fn(),
    getAllWindows: jest.fn(() => [])
  })),
  Menu: {
    buildFromTemplate: jest.fn(() => ({}))
  },
  Tray: jest.fn().mockImplementation(() => ({
    setToolTip: jest.fn(),
    setContextMenu: jest.fn()
  })),
  globalShortcut: {
    register: jest.fn()
  }
}));

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
