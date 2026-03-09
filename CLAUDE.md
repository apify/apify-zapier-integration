# CLAUDE.md

## Project Purpose

Zapier integration for the Apify platform. Allows users to connect Apify (Actors, Tasks, Datasets, Key-Value Stores) with 600+ apps via Zapier triggers, searches, and actions.

## Repository Structure

```
index.js                  # App entry point; registers all triggers, searches, creates
src/
  authentication.js       # Zapier auth configuration (API token-based)
  consts.js               # Shared constants, API endpoints, sample data, output fields
  apify_helpers.js        # Apify API helpers (dataset fetching, pagination, etc.)
  request_helpers.js      # HTTP request wrappers and Zapier middleware
  output_fields.js        # Dynamic output field builders
  zapier_helpers.js       # Zapier-specific utilities
  triggers/               # Zapier triggers (e.g., actor/task run finished, actor lists)
  searches/               # Zapier searches (actor last run, task last run, KV get, fetch dataset items)
  creates/                # Zapier actions (run actor, run task, set KV value, scrape URL)
test/
  helpers/                # Shared test utilities (mock data, token detection, nock helpers)
  searches/               # Tests for searches
  triggers/               # Tests for triggers
  creates/                # Tests for creates
```

## Technology Stack

- **Runtime**: Node.js 18
- **Framework**: `zapier-platform-core` v17.5.0
- **Apify SDK**: `apify-client` v2.15.0, `@apify/consts`, `@apify/utilities`
- **Utilities**: `lodash`, `dayjs`
- **Testing**: Mocha, Chai, nock (HTTP mocking)
- **Linting**: ESLint with `airbnb-base` config

## Build, Test & Run

```bash
# Install dependencies
npm install

# Run tests (mocked — no Apify account needed)
npm test

# Run tests against real Apify platform
TEST_USER_TOKEN=<your_apify_api_token> npm test

# Run a specific test by name
GREP="fetch dataset items" npm run test:grep

# Lint
npm run lint
npm run lint:fix
```

## Conventions

- **Module style**: CommonJS (`require`/`module.exports`), no ES modules.
- **ESLint**: Airbnb base style. Run `npm run lint` before committing.
- **Tests**: Use `nock` for HTTP mocking when `TEST_USER_TOKEN` is not set. Tests skip live API calls when using nock. Integration tests run only when `TEST_USER_TOKEN` is provided.
- **Commit style**: Conventional commits (`feat:`, `fix:`, `chore:`, etc.) with PR number suffix, e.g. `feat: add fields and omit options (#116)`.
- **Versioning**: Managed via `package.json`. Releases use the Zapier CLI (`zapier promote`) — only Apify team members can deploy.
- **npm overrides**: Security patches for `axios`, `lodash`, and `serialize-javascript` are applied via `overrides` in `package.json`. Do not remove these without verifying the upstream vulnerabilities are resolved.

## Key Notes for AI Assistants

- **Do not use `ApifyClient` for API calls inside the integration.** All HTTP requests must go through `z.request` (Zapier's request handler) to preserve Zapier's logging and middleware. See comment in `src/consts.js`.
- **`fetch_items.js` (Fetch Dataset Items search)**: Supports `fields` and `omit` input options (comma-separated strings). Whitespace around commas is trimmed before passing to the API. `fields` takes priority over `omit` when both are set — this is enforced server-side by the Apify API.
- **Input field groups**: The Fetch Dataset Items search uses `inputFieldGroups` (`basic` and `advanced`). `fields` and `omit` are in the `advanced` group.
- **Dataset lookup**: `findDatasetByNameOrId` first tries to GET a dataset by ID; if not found, it creates one by name via POST. This is intentional behavior.
- **Test structure**: Tests guard live API calls with `if (TEST_USER_TOKEN) return;` (nock-only tests) or `if (TEST_USER_TOKEN) { /* live path */ }` (both paths). Do not break this pattern.
- **No ES modules**: Keep all files as CommonJS. Do not introduce `import`/`export`.
