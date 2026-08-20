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
  request_helpers.js # Request/response middleware: auth headers, retries, centralized error handling
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
- **Runtime:** Node.js v22 (`.nvmrc` and `engines.node` are both pinned to 22)
- **Platform:** `zapier-platform-core` 19.0.0 (`zapier-platform-schema` 19.0.0 in devDependencies — keep both on the same major)
- **Apify SDK:** `apify-client` 2.19.0, `@apify/consts`, `@apify/utilities`
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
npx zapier-platform validate
```

Publishing to Zapier is handled automatically by `publish.yml` on GitHub release and is restricted to Apify team members with the deploy key.

## Conventions

- **Code style:** Airbnb ESLint base with 4-space indentation and 150-character line limit.
- **Indentation:** 4 spaces (enforced by `.editorconfig` and ESLint).
- **Line endings:** LF, UTF-8.
- **Commits/branches:** PRs target `master`. Releases are created as GitHub Releases; the publish workflow extracts the version from the release tag.
- **Versioning:** Semantic versioning; `package.json` version is updated automatically during publish.
- **CHANGELOG:** Updated automatically from GitHub release notes during publish. The release body is copied verbatim under a `## <version> / <date>` heading, so omit GitHub's auto-generated `## What's Changed` heading from release notes — it duplicates the version heading.

## Key Notes for AI Assistants

- This is a **plain JavaScript** project — do not introduce TypeScript or add type annotations.
- The Zapier app structure divides functionality into `triggers`, `creates`, and `searches` — new features must fit one of these categories and be registered in `index.js`.
- Tests run in two modes: mocked (default, uses nock) and E2E (requires `TEST_USER_TOKEN`). Keep both modes working when changing API interaction code in `apify_helpers.js` or `request_helpers.js`.
- API error handling is centralized in `validateApiResponse` (`src/request_helpers.js`), registered as the app-wide `afterResponse` middleware. Add new user-facing error cases there rather than in individual creates/searches/triggers — one branch covers every request path. The pattern: match on `errorInfo.error.type` from the Apify API response and throw `z.errors.Error(userMessage, 'ErrorName', status)` so the message reaches the user; a plain `Error` yields a generic failure, and `RetryableError` (5xx, 429) triggers exponential back-off. Only use `RetryableError` when retrying can actually succeed — e.g. `full-permission-actor-not-approved` requires manual approval in Apify Console, so it throws `z.errors.Error` with the `approvalUrl` appended instead.
- The `publish.yml` workflow updates `package.json` version and `CHANGELOG.md` automatically — do not manually edit these for releases.
- The `claude-md-maintenance.yml` workflow calls a reusable workflow from `apify/workflows` and runs on every push to `master`/`main`. It requires the `CLAUDE_MD_MAINTENANCE_ANTHROPIC_API_KEY` repository secret.
- Zapier app ID is `15018`; the `.zapierapprc` also includes `axios` dist files in the build bundle.
- `zapier-platform-schema` 19 renamed the input-field schema: use `zapier-platform-schema/lib/schemas/PlainInputFieldSchema` (not `FieldSchema`) when validating dynamic input fields, as in `test/apify_helpers.js`.
- `package.json` has an `overrides` block (`axios`, `diff`, `flatted`, `form-data`, `js-yaml`, `lodash`, `picomatch`, `serialize-javascript`) that exists to clear `npm audit` findings from transitive deps — keep it in sync when bumping dependencies rather than removing entries.
