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
