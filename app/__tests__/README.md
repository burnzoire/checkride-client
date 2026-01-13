# Checkride Client Test Suite

This directory contains comprehensive tests for the Checkride Client application.

## Quick Start

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Generate coverage report
npm run test:coverage
```

## Test Structure

- **unit/** - Unit tests for individual functions and components
- **integration/** - Integration tests for combined functionality
- **e2e/** - End-to-end tests (currently skipped)
- **fixtures/** - Test data and event samples
- **helpers/** - Mock utilities and test helpers

## Coverage

Current coverage: **87.7% statements** | **76.92% branches** | **75.47% functions** | **88.46% lines**

## Key Test Files

- `socket.test.js` - Tests for core socket functionality (36 tests)
- `app-lifecycle.test.js` - Tests for Electron app lifecycle (14 tests)
- `udp-handler.test.js` - Integration tests for UDP handling (9 tests)
- `preload.test.js` - Tests for browser window preload script (5 tests)
- `index.test.js` - Tests for application entry point (2 tests)

## Documentation

See **TEST_DOCUMENTATION.md** and **TEST_SUMMARY.md** in the project root for complete documentation.

## Adding New Tests

1. Create test file: `__tests__/unit/myfeature.test.js`
2. Import mocks: `const { createMockStore } = require('../helpers/mocks')`
3. Write test: `describe('My Feature', () => { it('should...', () => { ... }) })`
4. Run: `npm test`
5. Check coverage: `npm run test:coverage`

## Test Data

All test fixtures are in `fixtures/events.js` including:
- Kill events
- Takeoff/landing events
- Crash/eject events
- Connect/disconnect events
- And more...

## Mocking

All mocks are configured in `setup.js` and `helpers/mocks.js`:
- Electron modules (app, BrowserWindow, Tray, etc.)
- HTTP/HTTPS requests
- UDP sockets
- Electron-store
- Electron-log
