# checkride-client
by [Burnzoire](http://github.com/burnzoire)

[![Test Suite](https://github.com/burnzoire/checkride-client/actions/workflows/test.yml/badge.svg)](https://github.com/burnzoire/checkride-client/actions/workflows/test.yml)

DCS Achievement and Stats Tracker

## Installation

1. Download the latest installer from the Github releases page.
2. Select your DCS saved games folder or accept default.
3. Select your preferred installation folder.
4. Launch `Checkride Client`. It will appear in your system tray.

## Config

1. Right click the tray icon and select `Settings`.
2. Enter the location of the Server Host (omit `http://`)
3. Enter the port of the server (default `80`)
4. Enter the path prefix of the API (default `/api`)
5. Enter the API Token provided by an Admin
6. Check Use SSL if the server is securely hosted (under https://)
7. If desired, enter the path of a Discord webhook. All events will be posted here.
8. Click Save.

Settings are saved to `%APPDATA%/checkride-client/config.json`.

## Development

### DCS Mod

If making changes to the LUA, tt's recommended to create a symbolic link from `DCS-Checkride` to `Saved Games\DCS\Mods\Services` to save copying after every edit.

### Checkride App

To launch the Checkride Client in dev mode, simply run:

```
cd app
npm install
npm start
```

### Testing

The project has comprehensive test coverage. To run tests:

```
cd app
npm test                  # Run all tests
npm run test:watch        # Run tests in watch mode
npm run test:coverage     # Generate coverage report
```

Tests run automatically on push to main branch via GitHub Actions.

## Release

To create a Release:

```
npm run release:tag -- X.Y.Z
git push && git push origin vX.Y.Z
```

This will trigger a workflow that will build the app and its installer that can be downloaded directly from this repository's Releases page.


