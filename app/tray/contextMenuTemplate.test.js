const contextMenuTemplate = require('./contextMenuTemplate');

describe('contextMenuTemplate', () => {
  let mockApi;
  let mockOpenSettings;

  beforeEach(() => {
    mockApi = {
      ping: jest.fn(),
    };
    mockOpenSettings = jest.fn();
  });

  it('should return an array of menu items', () => {
    const menu = contextMenuTemplate(mockApi, mockOpenSettings);
    expect(Array.isArray(menu)).toBe(true);
    expect(menu.length).toBeGreaterThan(0);
  });

  it('should include Settings menu item at the top', () => {
    const menu = contextMenuTemplate(mockApi, mockOpenSettings);
    const firstItem = menu[0];

    expect(firstItem.label).toBe('Settings');
    expect(typeof firstItem.click).toBe('function');
  });

  it('should invoke provided callback when Settings is clicked', () => {
    const menu = contextMenuTemplate(mockApi, mockOpenSettings);
    const firstItem = menu[0];

    firstItem.click();

    expect(mockOpenSettings).toHaveBeenCalled();
  });

  it('should include About Checkride menu item', () => {
    const menu = contextMenuTemplate(mockApi, mockOpenSettings);
    const aboutItem = menu.find(item => item.label === 'About Checkride');

    expect(aboutItem).toBeDefined();
    expect(aboutItem.role).toBe('about');
  });

  it('should include separator', () => {
    const menu = contextMenuTemplate(mockApi, mockOpenSettings);
    const separator = menu.find(item => item.type === 'separator');

    expect(separator).toBeDefined();
  });

  it('should include Quit Checkride menu item', () => {
    const menu = contextMenuTemplate(mockApi, mockOpenSettings);
    const quitItem = menu.find(item => item.label === 'Quit Checkride');

    expect(quitItem).toBeDefined();
    expect(quitItem.role).toBe('quit');
    expect(quitItem.accelerator).toBe('CommandOrControl+Q');
  });

  it('should create menu items with proper structure', () => {
    const menu = contextMenuTemplate(mockApi, mockOpenSettings);

    menu.forEach(item => {
      if (item.type !== 'separator') {
        expect(item).toHaveProperty('label');
      }
    });
  });

});
