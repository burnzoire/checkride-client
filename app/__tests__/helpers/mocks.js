// Mock utilities for tests

/**
 * Create a mock HTTP/HTTPS request object
 */
function createMockHttpRequest() {
  const eventHandlers = {};
  
  const mockRequest = {
    on: jest.fn((event, handler) => {
      eventHandlers[event] = handler;
      return mockRequest;
    }),
    write: jest.fn(),
    end: jest.fn(),
    _triggerEvent: (event, ...args) => {
      if (eventHandlers[event]) {
        eventHandlers[event](...args);
      }
    },
    _getEventHandler: (event) => eventHandlers[event]
  };
  
  return mockRequest;
}

/**
 * Create a mock HTTP/HTTPS response object
 */
function createMockHttpResponse(data = null, statusCode = 200) {
  const eventHandlers = {};
  
  const mockResponse = {
    statusCode,
    on: jest.fn((event, handler) => {
      eventHandlers[event] = handler;
      return mockResponse;
    }),
    _triggerData: (chunk) => {
      if (eventHandlers['data']) {
        eventHandlers['data'](chunk);
      }
    },
    _triggerEnd: () => {
      if (eventHandlers['end']) {
        eventHandlers['end']();
      }
    },
    _triggerError: (error) => {
      if (eventHandlers['error']) {
        eventHandlers['error'](error);
      }
    }
  };
  
  return mockResponse;
}

/**
 * Create a mock UDP socket
 */
function createMockUdpSocket() {
  const eventHandlers = {};
  
  const mockSocket = {
    on: jest.fn((event, handler) => {
      eventHandlers[event] = handler;
      return mockSocket;
    }),
    bind: jest.fn(),
    send: jest.fn(),
    close: jest.fn(),
    address: jest.fn(() => ({
      address: '127.0.0.1',
      port: 41234
    })),
    _triggerMessage: (msg, rinfo) => {
      if (eventHandlers['message']) {
        eventHandlers['message'](msg, rinfo);
      }
    },
    _triggerListening: () => {
      if (eventHandlers['listening']) {
        eventHandlers['listening']();
      }
    },
    _triggerError: (error) => {
      if (eventHandlers['error']) {
        eventHandlers['error'](error);
      }
    }
  };
  
  return mockSocket;
}

/**
 * Create a mock electron-store instance
 */
function createMockStore(initialData = {}) {
  const store = {
    ...initialData
  };
  
  return {
    has: jest.fn((key) => key in store),
    get: jest.fn((key) => store[key]),
    set: jest.fn((key, value) => {
      store[key] = value;
    }),
    delete: jest.fn((key) => {
      delete store[key];
    }),
    clear: jest.fn(() => {
      Object.keys(store).forEach(key => delete store[key]);
    }),
    _getStore: () => store
  };
}

/**
 * Wait for a condition to be true
 */
async function waitFor(condition, timeout = 5000, interval = 100) {
  const startTime = Date.now();
  
  while (Date.now() - startTime < timeout) {
    if (await condition()) {
      return true;
    }
    await new Promise(resolve => setTimeout(resolve, interval));
  }
  
  throw new Error(`Timeout waiting for condition after ${timeout}ms`);
}

/**
 * Simulate a delay
 */
function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

module.exports = {
  createMockHttpRequest,
  createMockHttpResponse,
  createMockUdpSocket,
  createMockStore,
  waitFor,
  delay
};
