/**
 * Tests for preload.js
 */

describe('preload.js', () => {
  let mockDocument;
  let mockElement;

  beforeEach(() => {
    // Mock DOM elements
    mockElement = {
      innerText: ''
    };

    mockDocument = {
      getElementById: jest.fn((id) => {
        if (id.includes('-version')) {
          return mockElement;
        }
        return null;
      })
    };

    // Mock global objects
    global.document = mockDocument;
    global.window = {
      addEventListener: jest.fn()
    };

    // Mock process.versions
    global.process = {
      versions: {
        chrome: '96.0.4664.45',
        node: '16.13.0',
        electron: '16.0.0'
      }
    };
  });

  afterEach(() => {
    jest.resetModules();
    delete global.document;
    delete global.window;
  });

  it('should add DOMContentLoaded event listener', () => {
    require('../../preload.js');

    expect(window.addEventListener).toHaveBeenCalledWith(
      'DOMContentLoaded',
      expect.any(Function)
    );
  });

  it('should update chrome version element when DOM is loaded', () => {
    const chromeElement = { innerText: '' };
    mockDocument.getElementById = jest.fn((id) => {
      if (id === 'chrome-version') return chromeElement;
      return null;
    });

    require('../../preload.js');

    const domLoadedHandler = window.addEventListener.mock.calls[0][1];
    domLoadedHandler();

    expect(mockDocument.getElementById).toHaveBeenCalledWith('chrome-version');
    expect(chromeElement.innerText).toBe('96.0.4664.45');
  });

  it('should update node version element when DOM is loaded', () => {
    const nodeElement = { innerText: '' };
    mockDocument.getElementById = jest.fn((id) => {
      if (id === 'node-version') return nodeElement;
      return null;
    });

    require('../../preload.js');

    const domLoadedHandler = window.addEventListener.mock.calls[0][1];
    domLoadedHandler();

    expect(mockDocument.getElementById).toHaveBeenCalledWith('node-version');
    expect(nodeElement.innerText).toBe('16.13.0');
  });

  it('should update electron version element when DOM is loaded', () => {
    const electronElement = { innerText: '' };
    mockDocument.getElementById = jest.fn((id) => {
      if (id === 'electron-version') return electronElement;
      return null;
    });

    require('../../preload.js');

    const domLoadedHandler = window.addEventListener.mock.calls[0][1];
    domLoadedHandler();

    expect(mockDocument.getElementById).toHaveBeenCalledWith('electron-version');
    expect(electronElement.innerText).toBe('16.0.0');
  });

  it('should handle missing elements gracefully', () => {
    mockDocument.getElementById = jest.fn(() => null);

    require('../../preload.js');

    const domLoadedHandler = window.addEventListener.mock.calls[0][1];

    // Should not throw
    expect(() => domLoadedHandler()).not.toThrow();
  });

  it('should handle all dependencies in the correct order', () => {
    const dependencies = ['chrome', 'node', 'electron'];
    const getElementCalls = [];

    mockDocument.getElementById = jest.fn((id) => {
      getElementCalls.push(id);
      return mockElement;
    });

    require('../../preload.js');

    const domLoadedHandler = window.addEventListener.mock.calls[0][1];
    domLoadedHandler();

    expect(getElementCalls).toEqual([
      'chrome-version',
      'node-version',
      'electron-version'
    ]);
  });

  it('exposes settings load/save via contextBridge', () => {
    const { contextBridge, ipcRenderer } = require('electron');

    require('../../preload.js');

    expect(contextBridge.exposeInMainWorld).toHaveBeenCalledWith(
      'settings',
      expect.objectContaining({
        load: expect.any(Function),
        save: expect.any(Function)
      })
    );

    const settingsApi = contextBridge.exposeInMainWorld.mock.calls[0][1];

    settingsApi.load();
    settingsApi.save({ theme: 'dark' });

    expect(ipcRenderer.invoke).toHaveBeenCalledWith('settings:load');
    expect(ipcRenderer.invoke).toHaveBeenCalledWith('settings:save', { theme: 'dark' });
  });
});
