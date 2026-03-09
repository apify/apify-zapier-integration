# CLAUDE.md

## Project Purpose

Zapier integration for the Apify platform. Allows users to connect Apify actors, tasks, datasets, and key-value stores with 600+ apps via Zapier. Published as a Zapier app (ID: 15018).

## Repository Structure

```
src/
  creates/          # Zapier "create" actions (run actor, run task, scrape URL, set value)
  searches/         # Zapier "search" actions (last run, get value, fetch items)
  triggers/         # Zapier "trigger" actions (run finished, actors/tasks list, dynamic fields)
  apify_helpers.js  # Core Apify API interaction logic
  authentication.js # Zapier auth configuration
  consts.js         # API endpoints, limits, default values
  request_helpers.js
  output_fields.js
  zapier_helpers.js
test/               # Mirrors src/ structure; uses Mocha + Chai + nock
index.js            # App entry point (registers triggers/creates/searches)
.github/workflows/
  test.yml          # CI: lint + mocked tests + E2E tests on PRs
  publish.yml       # CD: version bump, CHANGELOG update, push to Zapier on GitHub release
  claude-md-maintenance.yml  # Keeps CLAUDE.md up to date on pushes to master/main
```

## Technology Stack

- **Language:** JavaScript (ES2022, no TypeScript)
- **Runtime:** Node.js v22 (`.nvmrc`), engines field requires Node >=18
- **Platform:** `zapier-platform-core` 17.5.0
- **Apify SDK:** `apify-client` 2.15.0, `@apify/consts`, `@apify/utilities`
- **Testing:** Mocha 11, Chai 4 (with chai-as-promised), nock 14 for HTTP mocking
- **Linting:** ESLint 8 with `eslint-config-airbnb-base`

## Build, Test & Run

```bash
npm install

# Run all tests (mocked API via nock)
npm test

# Run E2E tests against real Apify API
TEST_USER_TOKEN=<your_token> npm test

# Run tests matching a pattern
GREP="actor run" npm run test:grep

# Lint
npm run lint
npm run lint:fix

# Validate Zapier app schema
npx zapier validate
```

Publishing to Zapier is handled automatically by `publish.yml` on GitHub release and is restricted to Apify team members with the deploy key.

## Conventions

- **Code style:** Airbnb ESLint base with 4-space indentation and 150-character line limit.
- **Indentation:** 4 spaces (enforced by `.editorconfig` and ESLint).
- **Line endings:** LF, UTF-8.
- **Commits/branches:** PRs target `master`. Releases are created as GitHub Releases; the publish workflow extracts the version from the release tag.
- **Versioning:** Semantic versioning; `package.json` version is updated automatically during publish.
- **CHANGELOG:** Updated automatically from GitHub release notes during publish.

## Key Notes for AI Assistants

- This is a **plain JavaScript** project — do not introduce TypeScript or add type annotations.
- The Zapier app structure divides functionality into `triggers`, `creates`, and `searches` — new features must fit one of these categories and be registered in `index.js`.
- Tests run in two modes: mocked (default, uses nock) and E2E (requires `TEST_USER_TOKEN`). Keep both modes working when changing API interaction code in `apify_helpers.js` or `request_helpers.js`.
- The `publish.yml` workflow updates `package.json` version and `CHANGELOG.md` automatically — do not manually edit these for releases.
- The `claude-md-maintenance.yml` workflow calls a reusable workflow from `apify/workflows` and runs on every push to `master`/`main`. It requires the `CLAUDE_MD_MAINTENANCE_ANTHROPIC_API_KEY` repository secret.
- Zapier app ID is `15018`; the `.zapierapprc` also includes `axios` dist files in the build bundle.
