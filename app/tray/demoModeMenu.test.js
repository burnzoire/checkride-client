const { createDemoModeMenu } = require('./demoModeMenu');

describe('createDemoModeMenu', () => {
  it('returns empty array when controller is missing', () => {
    expect(createDemoModeMenu()).toEqual([]);
  });

  it('builds a start menu item when demo is not running', () => {
    const demoController = {
      isRunning: false,
      start: jest.fn(),
      stop: jest.fn(),
    };
    const onChange = jest.fn();

    const menu = createDemoModeMenu(demoController, { onChange });

    expect(menu[0].label).toBe('Start Demo Mode');

    menu[0].click();

    expect(demoController.start).toHaveBeenCalled();
    expect(demoController.stop).not.toHaveBeenCalled();
    expect(onChange).toHaveBeenCalled();
  });

  it('builds a stop menu item when demo is running', () => {
    const demoController = {
      isRunning: true,
      start: jest.fn(),
      stop: jest.fn(),
    };

    const menu = createDemoModeMenu(demoController);

    expect(menu[0].label).toBe('Stop Demo Mode');

    menu[0].click();

    expect(demoController.stop).toHaveBeenCalled();
    expect(demoController.start).not.toHaveBeenCalled();
  });

  it('does not call onChange when it is not a function', () => {
    const demoController = {
      isRunning: false,
      start: jest.fn(),
      stop: jest.fn(),
    };

    const menu = createDemoModeMenu(demoController, { onChange: 'nope' });

    menu[0].click();

    expect(demoController.start).toHaveBeenCalled();
  });
});
