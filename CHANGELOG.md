## 5.0.0 / 2026-10-27
**✨ New actions**
  * **Web Fetch**: fetch any web page and get its content as Markdown, cleaned HTML or plain text. It's fast, needs no Actor setup, and replaces **Scrape Single URL**.
  (#172, #188)
  * **Run Actor and Fetch Results**: run an Actor, wait for it to finish and get its dataset items in one step. You can set a Limit and choose which Fields to return.
  (#159)
  * **Get Actor Run by ID**: look up a run by its ID and get its details and dataset items. (#159)
  * **Get Actor Details**: get an Actor's title, description, stats and default run options by ID or `username/name`. (#159)
  * **Search Apify Store**: find public Actors by keyword or use case. (#159)
  * **Abort Actor Run**: stop a running Actor run, optionally gracefully. (#159)

  **🚀 Improvements**
  * Synchronous runs can now take much longer. Instead of failing after 6 minutes, the Zap step pauses and resumes when the run finishes. (#159)
  * When you test a single step in the Zap editor, it returns the partial results produced so far instead of timing out. (#159)
  * Clearer error messages for common problems: Actor not found (with a link to Apify Console), invalid JSON input, missing dataset, key-value store or record, empty
  dataset, and run timeouts. (#159)
  * If Apify can't find the Actor you selected, **Run Actor** and **Run Actor and Fetch Results** now say so where the input fields would be, instead of showing an empty
  form. (#187)
  * Action descriptions and help texts were rewritten so they're easier for both people and AI agents to follow. (#159, #179)
  * UX polish: consistent "Run ID" labels, Store Actors shown by default in the Actor picker, Limit and Fields shown above the Actor input, and labeled Store stats. (#191)

  **⚠️  Breaking changes**
  * **Scrape Single URL** is deprecated and hidden from new Zaps. Existing Zaps keep working, but please switch to **Web Fetch**. (#172)
  * **Get Key-Value Store Record** now fails with an error when the key or the store doesn't exist. Before, it returned an empty result (and could silently create an empty
  store). (#159)
  * **Fetch Dataset Items** now fails when the dataset doesn't exist or has no items. Before, it returned an empty result or silently created a new dataset. (#159)
  * **Set Key-Value Store Record** now fails when you pass a store ID that doesn't exist. Passing a store *name* still creates the store if it's missing. (#159)
  * **Run Actor** and **Run Task** now default **Run synchronously** to `yes` in new steps. Existing Zaps keep their saved setting. (#159)
  * Synchronous runs now stop at their timeout: up to 1 hour for **Run Actor** and **Run Task**, and 6 minutes for **Scrape Single URL**. Before, the Zap step failed but
  the run kept going on Apify. (#159)

  **🔧 Maintenance**
  * Fixed dependency vulnerabilities (#173), set up Renovate (#180), pinned Node.js 22 (#192), cleaned up the changelog (#170) and updated docs (#178, #181).

  **Contributors:** @jsimecek, @drobnikj, @jakcinmarina, @protoss70, @JanHranicky

  **Full Changelog**: https://github.com/apify/apify-zapier-integration/compare/v4.6.0...v5.0.0

## 4.6.0 / 2026-08-20
* feat: zapier update npm dependencies by @daveomri in https://github.com/apify/apify-zapier-integration/pull/149
* feat: surface approvalUrl for unapproved full-permission Actors by @daveomri in https://github.com/apify/apify-zapier-integration/pull/150
* Add UTM params to Apify API-token link by @drobnikj in https://github.com/apify/apify-zapier-integration/pull/160
* fix: Dependabot high severity package bumps by @JanHranicky in https://github.com/apify/apify-zapier-integration/pull/167


**Full Changelog**: https://github.com/apify/apify-zapier-integration/compare/v4.5.9...v4.6.0

## 4.5.9 / 2026-07-23
* fix: vulnerabilities by @protoss70
* fix: form-data vulnerability fix by @JanHranicky


**Full Changelog**: https://github.com/apify/apify-zapier-integration/compare/v4.5.8...v4.5.9

## 4.5.8 / 2026-05-11
- timeout bug

## 4.5.7 / 2026-04-17
Vulnerability fix

## 4.5.6 / 2026-03-30
Vulnerability fix

## 4.5.5 / 2026-03-20
* Fix issue when list items used default values and cannot be removed for input of Actor run

## 4.5.4 / 2026-03-09
- Added fields and omit options to get dataset for users to manage large results

## 4.5.3 / 2026-03-03
- Vulnerability fixes

## 4.5.2 / 2026-01-27
- Actor UI fields generation bug fix

## 4.5.1 / 2025-11-19
- Vulnerability fixed

## 4.5.0 / 2025-10-21
- Add support for new schemaBased editor in input schema

## 4.4.4 / 2025-10-17
- Multi-select dropdown fix

## 4.4.3 / 2025-09-22
- Vulnerability fix
- Status dropdown default value fix

## 4.4.2 / 2025-08-29
* remove limit and offset in the public signed url
* fix vulnerability
* bug fix for default values of Run Status field

## 4.4.1 / 2025-08-25
* Added signed URLs for shared dataset links, enabling secure access to datasets

## 4.4.0 / 2025-08-14
* Improved publishing workflow for smoother updates.
* Fixed a security vulnerability.
* Enhanced the "Select Actor" dropdown for easier selection.
* Optimized filtering of runs with multiple statuses

## 4.3.4 / 2025-07-08
* Fixes issue with connecting a new Apify Account

## 4.3.3 / 2025-07-07
* Actors are now sorted by their most recent run started by the user

## 4.3.2 / 2025-05-28
* Fix key-value store records with text values

## 4.3.1 / 2025-05-27
* Fix finding of last Actor and Task runs with 'TIMING-OUT' AND 'TIMED-OUT' statuses
* Add support for Apify key-value store records with non-JSON values
* Add multiple choice dropdown for Actor / task run triggers which allows selection of specific terminal state

## 4.0.2 / 2025-05-13
* Refactor adding integration header to the Apify Platform related requests

## 4.0.1 / 2025-05-13
* Fix adding new connection issue with OAuth2

## 4.0.0 / 2025-05-05
❗Authentication with Apify is now possible only via OAuth2

## 3.2.1 / 2024-11-23

* Updated packages

## 3.2.0 / 2024-11-23

* Improve output fields for all actions where dataset is included
* Updated packages

## 3.1.1 / 2023-11-14

* Fix falsy values in Actor run action

## 3.1.0 / 2023-10-09

* Add action to Scrape single URL
* Fix cases where choices fields are incorrectly displayed in the UI.

## 3.0.9 / 2023-08-29

* The Run Actor action allows to run Actors from Apify Store.

## 3.0.4 / 2023-08-15

❗ Action Run Actor generates UI based on Input Schema if Actor has one.
It breaks backward compatibility. If you set up the Actor run(with Input Schema) in old version, you need to set up it again using Zap UI.
* Update node js version to v18
* Improve dropdown for list of tasks and Actors
* Fix actor name into Actor
* Removed unused underscore package

## 2.1.19 / 2023-06-30

* Handle other content types on output of Actor run expect JSON as files.
* Update apify-client to v2

## 2.1.18 / 2023-05-23

* Update node to v16
* Update packages

## 2.1.16 / 2023-05-15

* Fix tests
* Updated sample run object to reflect Apify API changes

## 2.1.15 / 2021-08-11

* Updated dependencies
* Updated into node v14

## 2.1.13 / 2021-04-27

* Fixed authentication errors

## 2.1.12 / 2021-04-27

* Added underscore package back to package.json to avoid using v0.13.1, which cause issue with importing package on Zapier platform.

## 2.1.11 / 2021-04-26

* Migrate from underscore into lodash package

## 2.1.10 / 2021-04-26

* Updated apify-client package to 0.6.0

## 2.1.9 / 2021-04-14

* Updated packages dependencies
* Updated node to v12
* Fixes regarding migration zapier-platform-core from v9 to v10, see [changelog](https://github.com/zapier/zapier-platform/blob/master/CHANGELOG.md#1000).
* Migrated from travis into github actions
* Fixed warning regarding omitted items from dataset

## 2.1.8 / 2020-02-05

* Fixed trigger Actor/task run, it returns just succeeded runs for samples in setting the trigger.

## 2.1.7 / 2019-12-19

* Added links to RSS and HTML files to the output of dataset items action
* Updated integration to run nodejs v10
* Updated packages (included zapier-platform-core 9.0.0)

## 2.1.6 / 2019-06-07

* Thanks Zapier team for a following app review! We fixed all remaining issues in this release.

## 2.1.5 / 2019-05-31

* Thanks Zapier team for app review! We fixed all comments in this release.

## 2.1.4 / 2019-05-23

* Fixed bug in the Task Run trigger. This bug caused that hook can be called twice for one run.

## 2.1.3 / 2019-05-17

* Bug fixes

## 2.1.2 / 2019-05-14

* Minor improvements

## 2.1.1 / 2019-05-07

* Initial development
