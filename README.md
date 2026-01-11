# quoll-client

[![Test Suite](https://github.com/burnzoire/quoll-client/actions/workflows/test.yml/badge.svg)](https://github.com/burnzoire/quoll-client/actions/workflows/test.yml)
[![Coverage](https://img.shields.io/badge/coverage-66.5%25-yellow.svg)](https://github.com/burnzoire/quoll-client)

DCS Qualification Tracker

## Installation

### DCS Mod

1. Copy `Scripts\Hooks\DCS-Quoll-hook.lua` folder into `Saved Games\DCS\Scripts\Hooks\`
2. Copy `DSC-Quoll` into `Saved Games\DCS\Mods\`

### Quoll App

Once packaged (see below), the app can be distributed by copying `quoll-client-win32-x64` to a location of choice before running the `quoll-client.exe` contained within. As of writing, this app will launch in the system tray and no other UI exists. It's simply run as a daemon that forwards UDP datagrams on port `41234` to the webserver located at `http:localhost:3000`. Be sure to open both of these ports (UDP for the former, obvs, and TCP for the latter)

### Config

Browse to `%APPDATA%/quoll-client` and edit `config.json` to change settings, such as where to find the Quoll server. If this file is deleted, a new one will be created automatically with default values.

## Development

### DCS Mod

It's recommended to create a symbolic link from `DCS-Quoll` to ``Saved Games\DCS\Mods\` to save copying after every edit.

### Quoll App

To launch the quoll app in dev mode, simply run:

```
cd app
npm install
npm start
```

### Testing

The project has comprehensive test coverage (66.5%) with tests for core functionality. To run tests:

```
cd app
npm test                  # Run all tests
npm run test:watch        # Run tests in watch mode
npm run test:coverage     # Generate coverage report
```

Tests run automatically on push to main branch via GitHub Actions. The test suite includes:
- Unit tests for core functions (`ping`, `sendToDiscord`, `sendEventToServer`, `transformEventToGameEvent`)
- Integration tests for UDP message handling
- End-to-end workflow tests

**Note**: Some tests for app lifecycle and initialization are currently skipped as they test module-level initialization code.

## Packaging

Install the electron packager with `npm install electron-packager -g`

Package for windows (as it must run alongside DCS) with `electron-packager app --platform=win32 --asar --overwrite`. The `--asar` switch is to protect the source code in the package.
