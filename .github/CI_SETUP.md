# GitHub Actions CI Configuration

This repository uses GitHub Actions for continuous integration testing.

## Workflow

The test workflow (`.github/workflows/test.yml`) runs automatically on:
- Push to `main` branch
- Pull requests targeting `main` branch

## What Gets Tested

The workflow runs two parallel jobs:

**`test`** (windows-latest):
1. Sets up Node.js 20.x
2. Installs dependencies (`npm ci`)
3. Runs the JS suite with coverage (`npm run test:js -- --ci --coverage --maxWorkers=2`)
4. Extracts the coverage percentage and archives results as artifacts

**`lua-test`** (ubuntu-latest):
1. Installs Lua 5.1, LuaRocks, Busted, and LuaFileSystem
2. Runs the Lua suite (`busted lua/`)

## Viewing Results

- **Status Badge**: Check the README.md for the build status badge
- **Actions Tab**: Visit https://github.com/burnzoire/checkride-client/actions
- **Pull Requests**: CI status appears on each PR

## Test Requirements

For CI to pass:
- All JS tests must pass (Jest)
- All Lua tests must pass (Busted)
- Coverage thresholds are checked

## Local Testing

Before pushing, run tests locally (`npm test` runs both JS and Lua):
```bash
cd app
npm test          # JS (Jest) + Lua (Busted)
npm run test:js   # JS only
npm run lua:test  # Lua only
```

## Artifacts

Test results and coverage reports are saved as artifacts for 30 days after each run.

## Troubleshooting

If CI fails:
1. Check the Actions tab for detailed logs
2. Run tests locally: `npm test`
3. Check for Node version compatibility issues
4. Ensure all dependencies are properly listed in package.json

## Configuration

The workflow is defined in `.github/workflows/test.yml`. Key settings:

- **JS job OS**: Windows (matches development environment)
- **Lua job OS**: Ubuntu (Lua/Busted toolchain)
- **Node version**: 20.x
- **Max workers**: 2 (for parallel test execution)
- **Coverage**: Enabled with reporting

## Badges

Status badges are available in the README:
- Test Suite Status
- Coverage Percentage

## Future Enhancements

Possible improvements:
- Add Linux/macOS runners for cross-platform testing
- Set up automatic deployments on successful tests
- Add performance benchmarking
- Integrate with additional code quality tools
