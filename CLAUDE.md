# CLAUDE.md

## Project Purpose

Zapier integration for the Apify platform, allowing users to connect Apify Actors, tasks, datasets, and key-value stores to 600+ apps via Zapier.

## Repository Structure

```
index.js                  # App entry point; registers all triggers, searches, and creates
src/
  authentication.js       # Zapier authentication (Apify API token)
  consts.js               # Shared constants (API endpoints, field definitions, samples)
  apify_helpers.js        # Apify-specific API utilities (e.g. getDatasetItems)
  request_helpers.js      # HTTP request wrappers (retries, header injection, response parsing)
  output_fields.js        # Dynamic output field helpers
  zapier_helpers.js       # Zapier-specific utilities
  triggers/               # Zapier triggers (actor run finished, task run finished, actor/task lists)
  searches/               # Zapier searches (actor last run, task last run, get value, fetch dataset items)
  creates/                # Zapier creates (run actor, run task, scrape single URL, set value)
test/                     # Mocha tests mirroring src/ structure; use nock for HTTP mocking
```

## Technology Stack

- **Runtime**: Node.js 18
- **Framework**: `zapier-platform-core` 17.5.0
- **Apify SDK**: `apify-client` 2.15.0, `@apify/consts`, `@apify/utilities`
- **Testing**: Mocha, Chai, `chai-as-promised`, nock
- **Linting**: ESLint with `airbnb-base` config

## Build, Test & Run

```bash
npm install          # Install dependencies

npm test             # Run all tests with mocked HTTP (nock)
npm run test:grep    # Run filtered tests: GREP="pattern" npm run test:grep

# Run tests against the real Apify platform (requires API token):
TEST_USER_TOKEN=apify_api_xxxx npm test

npm run lint         # Lint src/ and index.js
npm run lint:fix     # Auto-fix lint issues in src/
```

## Conventions

- **Style**: Airbnb base ESLint rules; 4-space indentation; max line length 150.
- **Commits**: Conventional Commits format (`feat:`, `fix:`, `chore(release):`, etc.).
- **Versioning**: Managed via `npm version`; changelog updated in `CHANGELOG.md`.
- **Releases**: Deployed via Zapier CLI by Apify team members only (see Notion doc linked in README).
- **Input field groups**: Searches use `inputFieldGroups` — `basic` (emphasize: true) and `advanced` (emphasize: false) — to separate required and optional options in the Zapier UI.

## Key Notes for AI Assistants

- **Searches return an array** wrapping a single object; Zapier searches always expect an array.
- **`fields` and `omit` inputs** in `fetch_items.js` are comma-separated strings entered by users. They are trimmed (whitespace around each field name stripped) before being passed to the Apify API.
- **Dataset lookup** in `fetch_items.js` first tries by ID, then creates a named dataset if not found — do not change this fallback behavior.
- **`npm overrides`** pin transitive dependencies (`axios`, `lodash`, `serialize-javascript`) for security; do not remove these without checking for vulnerabilities.
- **No TypeScript**: the codebase is plain CommonJS JavaScript. Do not introduce TypeScript or ESM.
- **Tests** use nock to intercept HTTP calls. When adding a new search/create/trigger, add a corresponding test file under `test/` that mocks all external HTTP calls.
