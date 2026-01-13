const contextMenuTemplate = require('./contextMenuTemplate');

describe('contextMenuTemplate', () => {
  let mockUdpServer;
  let mockApi;
  let mockOpenSettings;

  beforeEach(() => {
    mockUdpServer = {
      send: jest.fn(),
    };
    mockApi = {
      ping: jest.fn(),
    };
    mockOpenSettings = jest.fn();
  });

  it('should return an array of menu items', () => {
    const menu = contextMenuTemplate(mockUdpServer, mockApi, mockOpenSettings);
    expect(Array.isArray(menu)).toBe(true);
    expect(menu.length).toBeGreaterThan(0);
  });

  it('should include Settings menu item at the top', () => {
    const menu = contextMenuTemplate(mockUdpServer, mockApi, mockOpenSettings);
    const firstItem = menu[0];

    expect(firstItem.label).toBe('Settings');
    expect(typeof firstItem.click).toBe('function');
  });

  it('should invoke provided callback when Settings is clicked', () => {
    const menu = contextMenuTemplate(mockUdpServer, mockApi, mockOpenSettings);
    const firstItem = menu[0];

    firstItem.click();

    expect(mockOpenSettings).toHaveBeenCalled();
  });

  it('should include About Checkride menu item', () => {
    const menu = contextMenuTemplate(mockUdpServer, mockApi, mockOpenSettings);
    const aboutItem = menu.find(item => item.label === 'About Checkride');

    expect(aboutItem).toBeDefined();
    expect(aboutItem.role).toBe('about');
  });

  it('should include Ping server menu item', () => {
    const menu = contextMenuTemplate(mockUdpServer, mockApi, mockOpenSettings);
    const pingItem = menu.find(item => item.label === 'Ping server');

    expect(pingItem).toBeDefined();
    expect(typeof pingItem.click).toBe('function');
  });

  it('should call api.ping when Ping server is clicked', () => {
    const menu = contextMenuTemplate(mockUdpServer, mockApi, mockOpenSettings);
    const pingItem = menu.find(item => item.label === 'Ping server');

    pingItem.click();
    expect(mockApi.ping).toHaveBeenCalled();
  });

  it('should include test events from createTestEvents', () => {
    const menu = contextMenuTemplate(mockUdpServer, mockApi, mockOpenSettings);

    // Test events should be included
    const testKillEvent = menu.find(item => item.label === 'Send test kill event');
    expect(testKillEvent).toBeDefined();
  });

  it('should include separator', () => {
    const menu = contextMenuTemplate(mockUdpServer, mockApi, mockOpenSettings);
    const separator = menu.find(item => item.type === 'separator');

    expect(separator).toBeDefined();
  });

  it('should include Quit Checkride menu item', () => {
    const menu = contextMenuTemplate(mockUdpServer, mockApi, mockOpenSettings);
    const quitItem = menu.find(item => item.label === 'Quit Checkride');

    expect(quitItem).toBeDefined();
    expect(quitItem.role).toBe('quit');
    expect(quitItem.accelerator).toBe('CommandOrControl+Q');
  });

  it('should create menu items with proper structure', () => {
    const menu = contextMenuTemplate(mockUdpServer, mockApi, mockOpenSettings);

    menu.forEach(item => {
      if (item.type !== 'separator') {
        expect(item).toHaveProperty('label');
      }
    });
  });
});
