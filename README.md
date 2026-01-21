# checkride-client

[![Test Suite](https://github.com/burnzoire/checkride-client/actions/workflows/test.yml/badge.svg)](https://github.com/burnzoire/checkride-client/actions/workflows/test.yml)

DCS Qualification Tracker

## Installation

### DCS Mod

1. Copy `Scripts\Hooks\DCS-Checkride-hook.lua` folder into `Saved Games\DCS\Scripts\Hooks\`
2. Copy `DSC-Checkride` into `Saved Games\DCS\Mods\`

### Checkride App

Once packaged (see below), the app can be distributed by copying `checkride-client-win32-x64` to a location of choice before running the `checkride-client.exe` contained within. As of writing, this app will launch in the system tray and no other UI exists. It's simply run as a daemon that forwards UDP datagrams on port `41234` to the webserver located at `http:localhost:3000`. Be sure to open both of these ports (UDP for the former, obvs, and TCP for the latter)

### Config

Browse to `%APPDATA%/checkride-client` and edit `config.json` to change settings, such as where to find the Checkride server. If this file is deleted, a new one will be created automatically with default values.

## Event Payload

Events pulled from DCS are normalised before being POSTed to the server at `/events`. The request body always has the following envelope:

```
{
	"event": {
		"event_type": "<one of the supported event names>",
		"event_uid": "<stable UUIDv5 derived from the enriched event payload>",
		"event_data": {
			/* keys listed below */
		}
	}
}
```

Envelope fields:

- event.event_type — required. One of `kill`, `takeoff`, `landing`, `crash`, `eject`, `pilot_death`, `self_kill`, `connect`, `disconnect`, `change_slot`.
- event.event_uid — required. Deterministic UUIDv5 generated from the enriched event payload.
- event.event_data — required. Container for the fields below. Keys omitted when the source value is unavailable.

event_data fields:

- airdrome_name — present for takeoff or landing, airfield name string.
- flyable — present on change_slot, boolean indicating whether the new slot is flyable.
- killer_name — present on kill, killer callsign string.
- killer_side — present on kill, integer or enum reflecting allegiance.
- killer_ucid — present on kill, unique client identifier string.
- killer_unit_name — present on kill, DCS unit name string.
- player_name — present on events with player_ucid, player callsign string.
- player_side — present on disconnect, integer or enum reflecting allegiance.
- player_ucid — present on connect, disconnect, takeoff, landing, crash, eject, pilot_death, self_kill, change_slot.
- prev_side — present on change_slot, previous coalition integer or enum.
- reason_code — present on disconnect, disconnect reason string or code.
- slot_id — present on change_slot, slot identifier string.
- unit_type — present on takeoff, landing, crash, eject, pilot_death, aircraft type string.
- victim_name — present on kill, victim callsign string.
- victim_side — present on kill, integer or enum reflecting allegiance.
- victim_ucid — present on kill, victim unique client identifier string.
- victim_unit_name — present on kill, DCS unit name string.
- weapon_name — present on kill, weapon identifier string.

All properties omitted in the list above are never part of the payload. Downstream services should treat unspecified keys as absent rather than null.

## Development

### DCS Mod

It's recommended to create a symbolic link from `DCS-Checkride` to ``Saved Games\DCS\Mods\` to save copying after every edit.

### Checkride App

To launch the checkride app in dev mode, simply run:

```
cd app
npm install
npm start
```

### Testing

The project has comprehensive test coverage (92%+) with tests for core functionality. To run tests:

```
cd app
npm test                  # Run all tests
npm run test:watch        # Run tests in watch mode
npm run test:coverage     # Generate coverage report
```

Tests run automatically on push to main branch via GitHub Actions. The test suite includes:
- Unit tests for event models (100% coverage)
- Unit tests for factories and services (100% coverage)
- Unit tests for API and Discord clients (100% coverage)
- Integration tests for UDP server (100% coverage)
- App initialization and tray menu tests

Coverage thresholds enforced:
- Statements: 90%
- Branches: 80%
- Functions: 95%
- Lines: 90%

## Packaging

Install the electron packager with `npm install electron-packager -g`

Package for windows (as it must run alongside DCS) with `electron-packager app --platform=win32 --asar --overwrite`. The `--asar` switch is to protect the source code in the package.

## Coverage

Coverage is tracked locally and displayed in the badge above. Run `npm test -- --coverage` in the app directory to generate a full coverage report.
