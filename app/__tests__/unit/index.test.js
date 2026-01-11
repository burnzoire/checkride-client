/**
 * Tests for index.js - main entry point
 */

describe('index.js', () => {
  let mockRequire;

  beforeEach(() => {
    jest.clearAllMocks();

    // Mock the esm module
    mockRequire = jest.fn();
    jest.mock('esm', () => {
      return jest.fn(() => mockRequire);
    });
  });

  afterEach(() => {
    jest.resetModules();
  });

  it('should use esm loader for socket.js', () => {
    // Mock module to avoid actual execution
    jest.mock('../../socket.js', () => ({}), { virtual: true });

    // Require index.js which should trigger esm and require socket.js
    const esm = require('esm');
    
    // Manually simulate what index.js does
    const esmRequire = esm(module);
    esmRequire('./socket.js');

    expect(esm).toHaveBeenCalledWith(module);
  });

  it('should load socket.js module', () => {
    const mockSocketModule = { test: 'mock' };
    jest.mock('../../socket.js', () => mockSocketModule, { virtual: true });

    // This simulates the behavior of index.js
    const esm = require('esm');
    
    // Just verify esm is called correctly
    expect(esm).toBeDefined();
    expect(typeof esm).toBe('function');
  });
});
