# Spike: Server Actor "Endpoint" interface inside Zapier's Run Actor action

Branch `test/server-actor-ui-spike` (local only, nothing pushed, no `zapier push`/`deploy`/`validate` with style check).
Date: 2026-10-07. API logic copied from the n8n spike (`n8n-nodes-apify@4b5c59d`, `serverActor.ts`) and
`server-actors/FINDINGS.md`. Only the UI layer is Zapier-specific.

## Verdict

**Feasible.** The whole flow fits in the existing **Run Actor** action without a new action:
Actor → Interface (Input / Endpoint) → Endpoint dropdown → typed param fields, with Input fields and Endpoint
fields mutually exclusive. Every piece was confirmed locally (unit tests + live API calls through the Zapier
runtime with `zapier invoke` in local mode and `createAppTester`). What could not be confirmed locally is the
real Zap editor rendering and the production step timeout (see Limits).

## What was built

| File | Change |
|---|---|
| `src/server_actor.js` (new) | Server Actor detection, OpenAPI parsing with local `$ref` resolution, OpenAPI → Zapier field mapping, dynamic Endpoint fields, the Endpoint perform, Endpoint output fields |
| `src/creates/actor_run.js` | New static `Interface` field (`actorInterface`, choices `input`/`endpoint`, default `input`, `altersDynamicFields`). `runSync` moved from a static field into one dynamic function `getInterfaceFields`, which returns either the old Input fields or the Endpoint fields. `perform` branches on the interface. `outputFields` became one function that follows the interface |
| `src/request_helpers.js` | `parseDataApiObject` and `validateApiResponse` skip `*.apify.actor` responses (they're arbitrary HTTP responses, not Apify API envelopes). Without this, an Actor's 500 becomes the generic "Apify API internal error" + retries (FINDINGS §5) |
| `src/triggers/actor_additional_fields.js` | Test-only side effect: added `outputFields: [{ key: 'key', primary: true }]`. `appTester` looks functions up by identity; `getActorAdditionalFields` is no longer referenced directly in `inputFields`, so it now resolves as this hidden trigger and hit the "trigger results need `id`" check |
| `test/creates/server_actor.js` (new) | 15 mocked tests (fields per state, schema validation of generated fields, perform GET/POST/path params, error mapping, no-interface error) |

API logic (same as n8n): Server Actor = `actorStandby.isEnabled` + `standbyUrl` on `GET /v2/acts/{id}`;
REST/MCP from `GET /v2/acts/{id}/builds/default` → `actorDefinition.webServerSchema` / `webServerMcpPath`;
call = `standbyUrl + path` with `Authorization: Bearer <token>` and `x-apify-integration-platform: zapier`;
no retries (per-request charging); `/health`, `/openapi.json`, … filtered from the endpoint list.

Tests: `npm test` → 77 passing, 8 pending (E2E-only), 0 failing. `npm run lint` clean (one pre-existing warning).
`zapier validate --without-style` → "structurally sound".

## Answers to the Zapier UI questions

| Question | Answer | How confirmed |
|---|---|---|
| Can Interface show/hide other fields? | **Yes.** A static field with `choices` + `altersDynamicFields: true`, followed by a function in `inputFields`. The function reads `bundle.inputData.actorInterface` and returns a different field set. There is no declarative show/hide (no n8n-style `displayOptions`); "hiding" = the function doesn't return the field | Function behavior confirmed (tests + live). The editor re-running the function when an `altersDynamicFields` field changes is documented Zapier behavior and already relied on by `actorId`/`build` in this app |
| Can the endpoint dropdown depend on the Actor? | **Yes.** Inline `choices` returned from the dynamic field function (the function already has `actorId`, and fetches the schema anyway). No extra dynamic-dropdown trigger needed. Alternatives: `dynamic: 'someTrigger.id.name'` (triggers get the action's `inputData`) or schema 19's `choices: { perform }` | Inline choices: confirmed. Alternatives: docs only |
| Can endpoint params become typed fields? | **Yes.** query/path params and JSON-body properties map to `string` / `integer` / `number` / `boolean`, `enum` → `choices`, array of primitives → `list: true` (with choices), map object (`additionalProperties`) → `dict: true`, other objects/arrays → `text` with JSON, `required`, `default`, `placeholder` from `example`, `description` → `helpText` (truncated to 1000, the schema max). All generated fields pass `PlainInputFieldSchema` | Tests + live (Web Fetch, RAG Web Browser) |
| "No server interface" state | A `copy` field (read-only markdown block) with a warning, and **no** Endpoint dropdown. MCP-only Actors get a different copy text. REST without OpenAPI gets a copy hint + only "Custom path…" (method, path, query `dict`, JSON body). `perform` still throws a clear `z.errors.Error` if a Zap is saved anyway. Throwing from the fields function was rejected: it would break the whole form, including the Interface switch | Copy field: confirmed as returned field; editor rendering: inferred (same pattern already ships for the Actor "Options" copy field) |
| One action returning a run *or* an HTTP response | **Works for output fields**: `outputFields: [fn]` returns run + dataset fields for Input and `status, contentType, method, url, body` for Endpoint. **Sample is one static object** per action (`ACTOR_RUN_SAMPLE`); it's only used when the user skips the test step, so Endpoint users who skip testing see a run-shaped sample | Output function: confirmed. Sample behavior: docs |
| Stale endpoint after switching Actor | Handled with a hidden reference field (`serverEndpointActorId`, `computed`, same trick as the existing `referenceActorId`); a stale endpoint shows no param fields and the dropdown must be re-picked. Schema 19 also has `dependsOn` for this (not tried) | Tests |

## Resolved field lists (live, `createAppTester` on `creates.createActorRun.operation.inputFields`)

**Input (default)**, `{actorId: apify~web-fetch}` (also any old Zap without `actorInterface`):
`searchLocation`, `actorId`, `actorInterface`=input, `runSync`, copy "Web Fetch", `input-url` (required),
`input-formats` (list, choices), copy "Advanced options", `input-headers`, `input-wait`, copy "Options",
`referenceActorId` (hidden), `build`, `timeoutSecs`, `memoryMbytes`. Same as today plus the Interface field.

**Endpoint + REST with OpenAPI**, `apify~web-fetch`:
- nothing chosen: `searchLocation`, `actorId`, `actorInterface`=endpoint, `serverEndpointActorId` (hidden),
  `serverEndpoint` (required, choices `GET /`, `POST /`, `Custom path…`). No run fields.
- `GET /`: + `saQuery_url` (string, required), `saQuery_formats` (list, choices markdown/html/text/links/raw),
  `saQuery_unwrap` (boolean), `saQuery_headers` (string), `saQuery_wait` (integer).
- `POST /`: + copy "Request body (JSON) fields", `saBody_url` (required), `saBody_formats` (list), `saBody_unwrap`
  (boolean), `saBody_headers` (**dict**), `saBody_wait` (integer).
- `apify~rag-web-browser` `GET /search`: 13 typed fields (`query` required, `maxResults` integer default 3,
  `scrapingTool` choices, `removeCookieWarnings` boolean default true, …).

**Endpoint + no server interface**, `apify~website-content-crawler`:
`searchLocation`, `actorId`, `actorInterface`=endpoint, copy "⚠️ This Actor has no server interface, so it has no
endpoints to call. Switch Interface to Input to start a run instead." Nothing else.

**Endpoint + MCP only**, `jiri.spilka~weather-mcp-server`: copy "This Actor is an MCP server (`/mcp`), not a REST
API…", `serverEndpoint` with only `Custom path…`.

**Endpoint + REST without OpenAPI**, `apify~super-scraper-api`: copy hint, `serverEndpoint` (`Custom path…`) →
`saCustomMethod`, `saCustomPath`, `saRawQuery` (dict), `saRawBody` (text).

## Live perform results (local runtime, real Apify)

| Call | Result |
|---|---|
| Web Fetch `GET /` url + formats [markdown, links] (`zapier invoke` and appTester) | `{status: 200, contentType: 'application/json', method, url, body: {…parsed JSON…}}`. `explode: false` honored: `formats=markdown,links` |
| Web Fetch `POST /` body fields incl. `headers` dict | 200, JSON body sent correctly |
| Web Fetch `unwrap=true`, html | `contentType: 'text/html'`, `body` = HTML string |
| Web Fetch `url=ftp://nope` | `ServerActorError` (400): `Unsupported URL protocol "ftp:"… (code: INVALID_URL)` — Actor's own message surfaced |
| super-scraper-api custom `GET /?url=…` | 200 `text/html` string |
| RAG Web Browser `GET /search` (single-tenant, cold) | 200, `body` = JSON array; **took 31 s** end-to-end |
| website-content-crawler with Endpoint | `NoServerInterface` error with clear text |
| Input interface, old Zap (no `actorInterface`) and explicit `input` | Run started (`READY`), unchanged behavior |

## Limits and risks

- **Step timeout (not confirmed).** Commonly cited Zapier limit is 30 s per action step (docs / this repo's
  `runSync` help text). But this repo's `waitForRunToFinish` waits up to 360 s (#87), which suggests the real limit
  is higher; nobody has measured it in a real Zap. The spike sets a 300 s client timeout (the platform's TTFB cap).
  A cold single-tenant Actor (RAG Web Browser) already took **31 s**, so if 30 s is real, many Endpoint calls fail
  on first use. Needs one test in a real Zap before committing to a design.
- **Payload size (from zapier-platform-core source).** `RESPONSE_SIZE_LIMIT = 6291456` (6 MB) in
  `core/src/constants.js`; above that, `large-response-cacher.js` stashes the payload if production sets
  `autostashPayloadOutputLimit`, otherwise it throws `Response size … exceeds maximum allowed size`. Not tested in
  production.
- **Binary responses not handled.** `response.content` is decoded as text; images/octet-stream would be corrupted.
  Would need `z.stashFile` and a file output field (not supported in local invoke).
- **Arbitrary output shape.** Zapier flattens nested JSON into `body__field` and arrays of objects into line
  items (docs, not verified in the editor). Output fields for `body` are not derived from the OpenAPI response
  schema; possible later (`responses.200.content.application/json.schema`).
- **Defaults are sent.** OpenAPI `default` is put into Zapier's `default`, which is saved and sent. Harmless for
  correct schemas, but it pins today's default. `placeholder` would avoid that.
- **No retries on Endpoint calls** (by design: per-request charging). 429/5xx from the platform surface directly.
- **Schema size.** Each form refresh costs 2 API calls (`/acts/{id}`, `/builds/default`). Fine, but the endpoint
  list has no search/pagination (inline choices); an Actor with hundreds of endpoints would be a long dropdown.
- **Field-key churn.** Param fields are keyed `saQuery_<name>` / `saBody_<name>`; if an Actor renames a param,
  saved Zaps lose that value silently.
- `computed: true` for the hidden reference field: the schema says it's for auth/internal use, but this app
  already ships it (`referenceActorId`), so it's assumed to work.

## Recommendation

**Integrate it into Run Actor** (as built), rather than a separate "Request Server Actor" action — the UI
mechanics all work, the user picks the Actor once, old Zaps are unaffected (missing `actorInterface` = Input),
and `outputFields` can follow the interface. Two caveats point the other way and should decide it:

1. **Sample and discoverability**: a separate action gets its own sample, label and description
   ("Call Server Actor endpoint"), and appears in Zapier's action search; inside Run Actor it is hidden behind a
   field. If marketing/discoverability matters, a separate action that reuses `src/server_actor.js` is ~30 lines.
2. **Timeout**: if the real step limit turns out to be 30 s, the feature is weak in either form; measure first.

Suggested next steps: one real-Zap test of the timeout (requires a private `zapier push` — needs explicit
approval), binary handling via `z.stashFile`, output fields from the OpenAPI response schema, and a decision on
MCP (hint only vs. a tool picker via `tools/list`).
