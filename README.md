# Zapier Apify Integration

The Apify integration to Zapier allows you to connect Apify platform with 600+ app.

## Resources

* [Apify documentation](https://docs.apify.com/tutorials/integrations#get-started)
* [Getting started tutorial](https://help.apify.com/en/articles/3034235-getting-started-with-apify-integration-for-zapier)
* [Apify integration](https://zapier.com/apps/Apify/integrations) page on Zapier platform


## Development

If you are interested in adding a new feature or fix a bug in integration, feel free to open PR.

### Tests

You will need your Apify API token before you run tests.
You can find the token [on your Apify account under the integration page](https://my.apify.com/account#/integrations).
After you can run the command to test the app:
```text
TEST_USER_TOKEN=your_token npm run test TEST_USER_TOKEN=your_api_token
```

### Release

Release new version needs to be done using [Zapier CLI](https://github.com/zapier/zapier-platform-cli#promoting-an-app-version).
Only Apify team members can deploy new versions, and there is d[ocument in notion how to do it](https://www.notion.so/apify/Zapier-integration-f6f60d2a830b4bd79ffd2212d0c1566b).
