# Test Refactoring Notes

## Overview

This document explains the refactoring done to maintain a single source of truth while keeping the test suite functional.

## Problem

Initially, a duplicate file `socket-testable.js` was created alongside `socket.js` to make functions testable by exporting them. This violated the principle of maintaining a single source of truth and created maintenance burden.

## Solution

### 1. Refactored `socket.js` to Export Functions

Added `export` keywords to key functions in the original `socket.js`:
- `createWindow()`
- `ping(storeInstance = store, httpModule = http_module)`
- `sendToDiscord(message, publish, storeInstance = store)`
- `transformEventToGameEvent(event)`
- `handleUdpMessage(msg, rinfo)`
- `sendEventToServer(payload, path, storeInstance = store, httpModule = http_module)`

Also exported key module-level variables for testing:
- `server` (UDP socket)
- `store` (electron-store instance)
- `http_module` (http or https based on config)

### 2. Added Dependency Injection for Testability

Functions now accept optional parameters for testing while defaulting to module-level instances in production:
```javascript
export function ping(storeInstance = store, httpModule = http_module) {
  // Function uses storeInstance instead of store directly
  // In production: called as ping() - uses module-level store
  // In tests: called as ping(mockStore, mockHttp) - uses injected mocks
}
```

This maintains backward compatibility (can still be called without arguments) while enabling proper unit testing.

### 3. Improved Error Handling

Added `req.on('error', ...)` handlers to all HTTP/HTTPS request objects to properly catch and reject promise on network errors. This fixed several timeout issues in tests.

### 4. Global Test Setup

Added comprehensive mocking in `__tests__/setup.js`:
- `dgram` module with mock socket
- `http` module 
- `https` module
- `electron-store` with sensible defaults

This ensures mocks are in place before `socket.js` is imported (which executes module-level code).

### 5. Removed Tests for Abstracted Functions

The following test files were renamed to `.skip` extension as they tested abstracted functions that don't exist in the original:
- `app-lifecycle.test.js` - tested `initializeApp`, `createTrayMenu`
- `udp-handler.test.js` - tested `createUdpServer`
- `complete-flow.test.js` - E2E tests using abstracted functions

The `initializeStore` tests were removed from `socket.test.js` as store initialization happens at module load.

## Results

- **Single Source of Truth**: All code in original `socket.js`, no duplication
- **Tests Passing**: 29/29 tests passing
- **Coverage**: 66.5% (down from 87.7% due to untested module-level initialization code)
- **Maintainability**: Changes to `socket.js` don't require updating a separate test file

## Trade-offs

1. **Lower Coverage**: Some module-level code (app initialization, tray menu setup) is not unit tested since it executes on import
2. **Fewer Tests**: Went from 56 tests to 29 tests by removing tests for abstracted functions
3. **Function Signatures**: Functions now have optional parameters for testing, slightly more complex signatures

## Future Improvements

To increase coverage back to 70%+, consider:
1. Re-enable integration and E2E tests by testing actual module behavior instead of abstracted functions
2. Extract app initialization logic into testable functions (requires refactoring but maintains single source)
3. Add more edge case tests for the core functions that are exported
