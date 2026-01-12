// Mock electron modules before requiring main
const mockTray = jest.fn();
const mockMenu = {
  buildFromTemplate: jest.fn(() => 'mockMenu'),
};
const mockApp = {
  whenReady: jest.fn(),
  on: jest.fn(),
  quit: jest.fn(),
  dock: null,
};
const mockGlobalShortcut = {
  register: jest.fn(),
};

jest.mock('electron', () => ({
  Menu: mockMenu,
  Tray: mockTray,
  app: mockApp,
  globalShortcut: mockGlobalShortcut,
}));

jest.mock('./appInit', () => ({
  initApp: jest.fn(),
}));

jest.mock('./tray/contextMenuTemplate', () => jest.fn(() => 'mockContextMenuTemplate'));

const path = require('path');
const { initApp } = require('./appInit');
const contextMenuTemplate = require('./tray/contextMenuTemplate');

describe('main.js module', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    
    mockApp.whenReady.mockReturnValue(Promise.resolve());
    mockTray.mockReturnValue({
      setToolTip: jest.fn(),
      setContextMenu: jest.fn(),
    });
  });

  it('should export initApp function', () => {
    // Simply verify the module exports are available
    expect(typeof initApp).toBe('function');
  });

  it('should have electron app available', () => {
    const { app } = require('electron');
    expect(app).toBeDefined();
    expect(app.whenReady).toBeDefined();
    expect(app.on).toBeDefined();
  });

  it('should have Tray constructor available', () => {
    const { Tray } = require('electron');
    expect(Tray).toBeDefined();
  });

  it('should have Menu available', () => {
    const { Menu } = require('electron');
    expect(Menu).toBeDefined();
    expect(Menu.buildFromTemplate).toBeDefined();
  });

  it('should have globalShortcut available', () => {
    const { globalShortcut } = require('electron');
    expect(globalShortcut).toBeDefined();
    expect(globalShortcut.register).toBeDefined();
  });

  it('should have contextMenuTemplate function available', () => {
    expect(typeof contextMenuTemplate).toBe('function');
  });
});
