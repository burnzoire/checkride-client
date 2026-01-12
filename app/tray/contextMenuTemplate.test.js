const contextMenuTemplate = require('./contextMenuTemplate');

describe('contextMenuTemplate', () => {
  let mockUdpServer;
  let mockApi;

  beforeEach(() => {
    mockUdpServer = {
      send: jest.fn(),
    };
    mockApi = {
      ping: jest.fn(),
    };
  });

  it('should return an array of menu items', () => {
    const menu = contextMenuTemplate(mockUdpServer, mockApi);
    expect(Array.isArray(menu)).toBe(true);
    expect(menu.length).toBeGreaterThan(0);
  });

  it('should include About Quoll menu item', () => {
    const menu = contextMenuTemplate(mockUdpServer, mockApi);
    const aboutItem = menu.find(item => item.label === 'About Quoll');
    
    expect(aboutItem).toBeDefined();
    expect(aboutItem.role).toBe('about');
  });

  it('should include Ping server menu item', () => {
    const menu = contextMenuTemplate(mockUdpServer, mockApi);
    const pingItem = menu.find(item => item.label === 'Ping server');
    
    expect(pingItem).toBeDefined();
    expect(typeof pingItem.click).toBe('function');
  });

  it('should call api.ping when Ping server is clicked', () => {
    const menu = contextMenuTemplate(mockUdpServer, mockApi);
    const pingItem = menu.find(item => item.label === 'Ping server');
    
    pingItem.click();
    expect(mockApi.ping).toHaveBeenCalled();
  });

  it('should include test events from createTestEvents', () => {
    const menu = contextMenuTemplate(mockUdpServer, mockApi);
    
    // Test events should be included
    const testKillEvent = menu.find(item => item.label === 'Send test kill event');
    expect(testKillEvent).toBeDefined();
  });

  it('should include separator', () => {
    const menu = contextMenuTemplate(mockUdpServer, mockApi);
    const separator = menu.find(item => item.type === 'separator');
    
    expect(separator).toBeDefined();
  });

  it('should include Quit Quoll menu item', () => {
    const menu = contextMenuTemplate(mockUdpServer, mockApi);
    const quitItem = menu.find(item => item.label === 'Quit Quoll');
    
    expect(quitItem).toBeDefined();
    expect(quitItem.role).toBe('quit');
    expect(quitItem.accelerator).toBe('CommandOrControl+Q');
  });

  it('should create menu items with proper structure', () => {
    const menu = contextMenuTemplate(mockUdpServer, mockApi);
    
    menu.forEach(item => {
      if (item.type !== 'separator') {
        expect(item).toHaveProperty('label');
      }
    });
  });
});
