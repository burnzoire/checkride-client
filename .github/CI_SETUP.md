# GitHub Actions CI Configuration

This repository uses GitHub Actions for continuous integration testing.

## Workflow

The test workflow (`.github/workflows/test.yml`) runs automatically on:
- Push to `main` branch
- Pull requests targeting `main` branch

## What Gets Tested

The CI pipeline:
1. Sets up Node.js (versions 18.x and 20.x)
2. Installs dependencies
3. Runs full test suite
4. Generates coverage reports
5. Uploads coverage to Codecov (optional)
6. Archives test results as artifacts

## Viewing Results

- **Status Badge**: Check the README.md for the build status badge
- **Actions Tab**: Visit https://github.com/burnzoire/quoll-client/actions
- **Pull Requests**: CI status appears on each PR

## Test Requirements

For CI to pass:
- All tests must pass (56 tests)
- Tests run on both Node 18.x and 20.x
- Coverage thresholds are checked

## Local Testing

Before pushing, run tests locally:
```bash
cd app
npm test
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

- **OS**: Windows (matches development environment)
- **Node versions**: 18.x, 20.x
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
