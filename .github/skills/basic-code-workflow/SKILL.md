---
name: basic-code-workflow
description: Basic development workflow for checkride-client with emphasis on Jest tests.
---

# Basic Code Workflow (checkride-client)

Use this workflow for Electron client changes.

## 1. Before editing
- Read the service/module and its existing tests first.
- Follow existing achievement/service patterns.

## 2. Run tests (native, preferred on Windows)
Run commands from `app/`:
- Full suite: `npm test`
- Single file: `npm test -- achievements/specialDelivery.test.js --runInBand`
- Watch mode: `npm run test:watch`

## 3. Optional Docker fallback
Use this only if you cannot run Node/Jest natively.
From repository root, run inside a Node container:
- Full suite:
  - `docker run --rm -v "${PWD}/app:/app" -w /app node:20 bash -lc "npm ci && npm test"`
- Single file:
  - `docker run --rm -v "${PWD}/app:/app" -w /app node:20 bash -lc "npm ci && npm test -- achievements/specialDelivery.test.js --runInBand"`

## 4. Validate after edits
- Run the most targeted tests first.
- For behavior changes, run related integration tests too.

## 5. Commit hygiene
- Keep changes focused and include tests for new behavior.
