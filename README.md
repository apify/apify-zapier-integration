# Zapier Apify Integration
<a href="https://travis-ci.org/apifytech/apify-zapier-integration?branch=master"><img src="https://travis-ci.org/apifytech/apify-zapier-integration.svg?branch=master" alt="Build Status" style="display:inherit;"></a>

The Apify integration to Zapier allows you to connect Apify platform with 600+ app.

## How it works

You can follow [Apify integration](https://zapier.com/apps/Apify/integrations) page on Zapier platform.


## Development

### Tests

You need to specify your Apify API token before you run tests.
You can do in root dir using file `.env`.
```text
TEST_USER_TOKEN=your_api_token
```
You can set up an environment variable `TEST_USER_TOKEN=your_token npm run test`.
Then you can run tests using command `npm run test`.

### Deploy

Login account which has access to Apify app using `zapier login`.

1. Update version of app in package.json.
2. Deploy new version to zapier using `zapier push`.
3. Set the version as production using `zapier promote 1.0.0`.
4. Migrate users to new version using `zapier migrate 1.0.0 1.0.1 100%`.
or 
4. Deprecate old version using `zapier deprecate 1.0.0`.


