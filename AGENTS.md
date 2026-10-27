# AGENTS.md

Guidance for coding agents working in this repository. `CLAUDE.md` is only an `@AGENTS.md` pointer,
so put instructions here and leave the pointer alone. `.github/workflows/agents-md-maintenance.yml`
checks this file on every non-draft PR from a branch in this repo and commits a fix when the PR made
it wrong. It skips PRs from forks, from `[bot]` accounts and `apify-service-account`, and from
branches starting with `release/`, `hotfix/` or `sync-`.

## Project

Apify's [Zapier](https://zapier.com/apps/Apify/integrations) app (app ID `15018`, see `.zapierapprc`),
built on `zapier-platform-core`. Plain CommonJS JavaScript with no build step and no TypeScript — keep
it that way. `index.js` registers every trigger, search and create; each lives in its own file under
`src/triggers`, `src/searches` or `src/creates`, and `test/` mirrors that layout.

## Commands

```bash
npm install
npm run lint                         # eslint ./src index.js
npm test                             # mocha --recursive, Apify API mocked with nock
TEST_USER_TOKEN=<token> npm test     # same suite against the live Apify API (E2E)
GREP="actor run" npm run test:grep
npx -p zapier-platform-cli zapier-platform validate --without-style
```

`zapier-platform-cli` is not a dependency; CI installs it globally. CI (`test.yml`, PRs to `master`)
runs validate, lint and tests twice: mocked, and E2E with a real token. `lint:fix` only covers `src/`.
The E2E token is `APIFY_TEST_USER_API_TOKEN`, an org secret shared with other Apify repos. Every PR
run from a branch in this repo receives it, so anyone who can push a branch can read it through a
test change. Never point the E2E job at a personal or production token instead.
Node follows the Zapier runtime: `engines` is `22`, and `.nvmrc` pins the exact version CI uses.

Each test decides per case: `if (!TEST_USER_TOKEN)` it sets up `nock('https://api.apify.com')`,
otherwise it hits the live API (`test/helpers` loads `.env` via `zapier.tools.env.inject()`). Keep
both paths working when you change request code. Some tests only run in one mode and show as pending.
The live API is eventually consistent: assert on webhooks with `waitForWebhookCount` from
`test/helpers`, not a single immediate `list()`.

## Architecture

### Request pipeline

All HTTP goes through `z.request`, so the app-wide middleware in `src/request_helpers.js` applies:

- `setApifyRequestHeaders` (`beforeRequest`) adds `Authorization: Bearer <access_token>` and
  `x-apify-integration-platform: zapier`, but only for hosts in `APIFY_HOSTS` (`api.apify.com` and
  the Web Fetch standby host). Add a host there if a new endpoint needs the token.
- `parseDataApiObject` unwraps the API's `{ data: ... }` envelope into `response.data`.
- `validateApiResponse` is the single place for user-facing API errors. Order matters: a 404 on a
  key-value store `/records/` GET/HEAD is let through (callers check `status === 404`); Web Fetch
  errors are mapped next; then 5xx throws `RetryableError`; other ≥300 statuses are matched on
  `error.type`. The 429 branch never runs: `zapier-platform-core` throws `ThrottledError` on a 429
  before app middleware, and Zapier retries the step later. Throw `z.errors.Error(message, name,
  status)` for messages the user must see — Zapier's docs say a plain `Error` won't work as expected.
  Use `RetryableError` only when a retry can succeed:
  `full-permission-actor-not-approved` needs manual approval, so it throws `z.errors.Error` with the
  `approvalUrl` appended.
- Retries only happen where a call is wrapped in `wrapRequestWithRetries` (exponential back-off,
  3 attempts in total). Most calls are; a bare `z.request` is not retried.

Auth is OAuth2 with PKCE against Apify Console (`src/authentication.js`, `CLIENT_ID`/`CLIENT_SECRET`
from env). `autoRefresh` is deliberately off: with it on, core turns every 401 into
`RefreshAuthError`, and the app has no `refreshAccessToken` to answer it.

### Running Actors and tasks

`buildActorRunRequestOptions` (`apify_helpers.js`) is shared by Run Actor and Run Actor and Fetch
Results. With a raw `inputBody` it posts that; otherwise it fetches the Actor's build input schema
and rebuilds the input from the dynamic fields, converting values per editor in `processInputField`.

Synchronous runs don't block `perform`, since Zapier kills a step after 30 s
(`ZAPIER_STEP_TIMEOUT_SECS`). Instead the run is started with an ad-hoc `webhooks` param pointing at
`z.generateCallbackUrl()` (which is what pauses the step), and `performResume` re-fetches the run via
`getActorRunOnResume`. Rules that follow from this:

- Call `z.generateCallbackUrl()` only on the sync path — calling it pauses the Zap.
- In the Zap editor's test step (`bundle.meta.isLoadingSample`) no callback is requested (Zapier
  advises avoiding callbacks while sampling), so the step polls with `waitForRunToFinish` for
  `TEST_STEP_RUN_WAIT_SECS` (25 s) and returns what it has.
- Sync run timeouts are capped at `DEFAULT_SYNC_RUN_TIMEOUT_SECS` (1 hour). Run Task reads the
  task's timeout (falling back to the Actor default) because the input has none.

### Dynamic fields and outputs

- Actor input fields come from the Actor's input schema (`getActorAdditionalFields`,
  `convertPropertyToInputFields`). Field keys are `input-<property>`, except `schemaBased` objects,
  which are keyed by the slugified *title* (`input-<slug>`) to work around
  [zapier-platform#1178](https://github.com/zapier/zapier-platform/issues/1178); the run side looks
  up both. Apify `prefill` maps to Zapier `default`, Apify `default` to `placeholder`. String-list
  editors use `placeholder`, never `default`: a list-field default becomes a row the user can't remove.
- The Zap editor doesn't show errors thrown while it loads fields, so `getActorAdditionalFields`
  reports problems as read-only `type: 'copy'` fields instead: "Select an Actor…" before an Actor is
  picked, and the not-found message for an Actor the account can't access. Running the step looks
  the Actor up again and throws the same message.
- A hidden computed `referenceActorId` field detects when the user picks another Actor, so the
  build tag resets.
- Dataset output fields are inferred from the first 10 items of the last successful run
  (`src/output_fields.js` + `convertPlainObjectToFieldSchema`).
- Run outputs go through `enrichActorRun`: `OUTPUT` from the default key-value store, up to 100
  dataset items, public file URLs per format, a Console link, and `OMIT_ACTOR_RUN_FIELDS` removed.
  When called from a trigger or run step (`runFromTrigger`), `getDatasetItems` first samples one item
  and returns a `warning` item plus file URLs instead of the data if the download would exceed 10 MB
  (`DATASET_ITEMS_INLINE_MAX_BYTES`, with a 1.2× margin). Keep that guard on new dataset paths.

### Storages

`findStorageOrThrow` resolves a dataset or store by ID, `username~name` or bare name (sent as
`~name`) and throws a user-facing error with a Console link if it's missing — used by Get Key-Value
Store Record and Fetch Dataset Items. Set Key-Value Store Record instead uses
`getOrCreateKeyValueStore`, which creates a store for an unknown *name* but throws for an unknown ID.

### Web Fetch

`src/creates/web_fetch.js` posts to the Web Fetch Standby Actor at `WEB_FETCH_STANDBY_URL`
(`https://web-fetch.apify.actor`), not `api.apify.com`. Its errors use a flat `{ code, error }`
envelope, mapped by `parseWebFetchError` *before* the generic 5xx handling: its 502/504 codes
describe the target site and must not be retried. Its own 25 s request timeout surfaces as a
node-fetch `request-timeout` error and is handled in the create. Each output format is a separate
`format_<name>` boolean because a Zapier list-field default can't be deselected.

- `validateUrl` rejects anything but one http(s) URL before calling the Actor. Zapier joins a mapped
  line-item field with commas, and Web Fetch would fetch the first URL with the rest as its path.
- `formatOutput` drops the proxy's `x-apify-unblocker-route` header and passes `metadata.jsonLd` as
  one JSON string, because Zapier would flatten it into dozens of output fields.
- "Fail on error status" defaults to Yes. Zaps created before the option existed have no value, so
  the create treats only an explicit No (`isUnchecked`) as off. Use the same pattern for any new
  option that defaults to Yes.

## Conventions and gotchas

- **Keys are a contract.** Trigger/search/create keys and input-field keys are what existing Zaps
  reference; renaming or removing one breaks them. Deprecate with `display.hidden: true` and leave
  it registered — e.g. `scrapeSingleUrl`, replaced by Web Fetch. Hidden triggers (`actors`,
  `actorsWithStore`, `tasks`, …) back dynamic dropdowns and field loaders.
- Searches must return an array (`[]` for "not found").
- `src/searches/get_value.js` exports `{ hydrators, perform }`; `index.js` registers
  `getValueSearch.perform` and spreads its hydrators (`stashFunction`, which turns non-JSON records
  into files).
- Validate dynamic fields in tests with `zapier-platform-schema/lib/schemas/PlainInputFieldSchema`
  (`FieldSchema` is gone as of schema 19), as `test/apify_helpers.js` does.
- User-facing copy (labels, `helpText`, `display.description`): short and direct — "Actor"
  capitalized, "Apify Console"/"Apify Store", "e.g." for examples, step and field names in bold
  (**Run Task**), no "Please".
- Style: Airbnb base, 4-space indent, 150-char lines, `arrow-parens: always`, final newline.
- **Releases** are a GitHub Release: `publish.yml` sets `package.json` to the tag version, prepends
  the release body to `CHANGELOG.md` under `## <version> / <date>`, commits, then
  `zapier-platform push` and `promote`. Don't bump the version or edit `CHANGELOG.md` by hand, and
  leave GitHub's `## What's Changed` heading out of the release body (it duplicates the heading).
- Renovate (`renovate.json5`) opens weekly `chore:` PRs, groups `zapier-platform-core` and
  `zapier-platform-schema` (keep them on the same version), and skips Node majors. The
  `package.json` `overrides` entry (`zapier-platform-core` → `form-data`) clears an `npm audit`
  finding; check `npm audit` before removing it.
- `.zapierapprc` adds `node_modules/axios/dist/*.js` to the build bundle via `includeInBuild`.
