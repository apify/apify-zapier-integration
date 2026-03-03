# CLAUDE.md

## Project Purpose

Apify integration for the Zapier platform. Connects Apify (actor/task runs, key-value stores, datasets) to 600+ apps via Zapier triggers, searches, and creates.

## Repository Structure

```
index.js               # App entry point — registers all triggers/searches/creates
src/
  authentication.js    # Zapier auth configuration (Apify API token)
  consts.js            # Shared constants and sample data (ACTOR_RUN_SAMPLE, etc.)
  apify_helpers.js     # Apify API utilities
  request_helpers.js   # Zapier beforeRequest/afterResponse hooks
  zapier_helpers.js    # Zapier-specific utilities
  output_fields.js     # Dynamic output field definitions
  triggers/            # Zapier triggers (actor_run_finished, task_run_finished, actors, tasks, …)
  searches/            # Zapier searches (actor_last_run, task_last_run, get_value, fetch_items)
  creates/             # Zapier creates (actor_run, task_run, scrape_single_url, set_value)
test/
  helpers/index.js     # Shared test utilities (getMockRun, randomString, nock helpers)
  triggers/            # Trigger tests
  searches/            # Search tests
  creates/             # Create tests
```

## Technology Stack

- **Runtime:** Node.js 18
- **Framework:** `zapier-platform-core` 17.5.0
- **Apify SDK:** `apify-client` 2.15.0, `@apify/consts`, `@apify/utilities`
- **Testing:** Mocha + Chai + nock (HTTP mocking)
- **Linting:** ESLint with airbnb-base config

## Build, Test & Run

```bash
npm install          # Install dependencies

npm test             # Run all tests (mocked — no API token needed)
npm run test:grep    # Run tests matching $GREP pattern
                     # e.g. GREP="actor run" npm run test:grep

# Run tests against the real Apify platform (requires API token):
TEST_USER_TOKEN=<apify_api_token> npm test

npm run lint         # Lint src/ and index.js
npm run lint:fix     # Auto-fix lint issues
```

## Conventions

- CommonJS (`require`/`module.exports`) — no ESM.
- Each trigger/search/create is a self-contained module exporting a Zapier resource object with a unique `key`.
- Sample/constant data lives in `src/consts.js` (e.g. `ACTOR_RUN_SAMPLE`, `SCRAPE_SINGLE_URL_RUN_SAMPLE`). Keep samples in sync with the actual Apify API response shape, including `storageIds` (`keyValueStoreId`, `datasetId`, `requestQueueId`).
- Test mocks use `getMockRun()` from `test/helpers/index.js`; keep it aligned with `ACTOR_RUN_SAMPLE`.
- Releases are deployed via Zapier CLI by Apify team members only.

## Key Notes for AI Assistants

- **Security overrides:** `package.json` uses `overrides` to enforce patched versions of transitive dependencies (`axios ≥1.13.6`, `serialize-javascript ≥7.0.3`). Do not remove or downgrade these overrides.
- **`lodash` override** uses `"$lodash"` (self-reference syntax) to ensure a single resolved version is used everywhere — this is intentional.
- When adding or changing Apify run-related fields, update all three places: `src/consts.js` (samples), `test/helpers/index.js` (`getMockRun`), and any relevant output field definitions.
- The integration has no build step — files in `src/` are used directly.
- Do not push new versions to Zapier without team coordination (see Notion release doc).
