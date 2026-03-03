# CLAUDE.md

## Project Purpose

Zapier integration for the Apify platform. Allows users to connect Apify (actors, tasks, key-value stores, datasets) with 600+ apps via Zapier triggers, searches, and create actions.

## Repository Structure

```
index.js               # App entry point — registers all triggers, searches, creates
src/
  authentication.js    # OAuth2 (with PKCE) auth flow and connection label
  consts.js            # Apify API endpoint constants
  request_helpers.js   # Request middleware (headers, retries, response parsing)
  apify_helpers.js     # Apify-specific helper utilities
  zapier_helpers.js    # Zapier-specific helper utilities
  output_fields.js     # Output field definitions
  creates/             # Create actions: actor_run, task_run, scrape_single_url, set_value
  triggers/            # Triggers: actor_run_finished, task_run_finished, actors, tasks,
                       #           actors_with_store, actor_additional_fields,
                       #           actor_dataset_additional_output_fields
  searches/            # Searches: actor_last_run, task_last_run, get_value, fetch_items
test/                  # Mocha test suite mirroring src/ structure
```

## Technology Stack

- **Runtime**: Node.js 18
- **Zapier SDK**: `zapier-platform-core` 17.5.0
- **Apify SDK**: `apify-client` 2.15.0
- **Utilities**: `lodash`, `dayjs`, `@apify/consts`, `@apify/utilities`
- **Testing**: Mocha 11, Chai, `chai-as-promised`, nock (HTTP mocking)
- **Linting**: ESLint 8 with `eslint-config-airbnb-base`

## Build, Test & Run

```bash
# Install dependencies
npm install

# Run tests (mocked — no Apify account needed)
npm test

# Run tests against live Apify platform
TEST_USER_TOKEN=<apify_api_token> npm test

# Run a specific test by name
GREP="some test name" npm run test:grep

# Lint
npm run lint

# Lint with auto-fix
npm run lint:fix
```

## Conventions

- **Indentation**: 4 spaces (enforced by ESLint)
- **Max line length**: 150 characters
- **Style**: airbnb-base ESLint rules with some relaxed rules (`no-param-reassign`, `consistent-return`, `no-await-in-loop` are off)
- **Authentication**: OAuth2 with PKCE only (API token auth was removed in v4.0.0)
- **Security patches**: Applied via `npm overrides` in `package.json` (currently: axios, lodash, serialize-javascript)
- **Versioning**: Semantic versioning; changelog maintained in `CHANGELOG.md`
- **Releases**: Deployed via Zapier CLI by Apify team members only (see internal Notion doc)

## Key Notes for AI Assistants

- Tests default to mocked HTTP (via nock). Set `TEST_USER_TOKEN` only when intentionally testing against the live Apify API.
- Authentication is OAuth2 + PKCE only. Do not reintroduce API token auth.
- Security vulnerability fixes are applied through `package.json` `overrides`, not by directly pinning transitive deps.
- Releases require the Zapier CLI and Apify team credentials — do not attempt to publish or promote versions.
- The `test/` directory mirrors `src/` structure; new source modules should have matching test files.
