# Zapier Apify Integration

The Apify integration to Zapier allows you to connect Apify platform with 600+ app.

## Resources

* [Apify documentation](https://docs.apify.com/tutorials/integrations#get-started)
* [Getting started tutorial](https://help.apify.com/en/articles/3034235-getting-started-with-apify-integration-for-zapier)
* [Apify integration](https://zapier.com/apps/Apify/integrations) page on Zapier platform


## Development

If you are interested in adding a new feature or fixing a bug in the integration, feel free to open a pull request.

### Tests

You will need your Apify API token before you run tests.
You can find the token [on the Integrations page of your Apify account](https://my.apify.com/account#/integrations).
Run this command to test the app:
```text
TEST_USER_TOKEN=your_token npm run test TEST_USER_TOKEN=your_api_token
```

### Release

New versions should be released using the [Zapier CLI](https://github.com/zapier/zapier-platform-cli#promoting-an-app-version).
Only Apify team members can deploy new versions, and there is a [document in Notion on how to do it](https://www.notion.so/apify/Zapier-integration-f6f60d2a830b4bd79ffd2212d0c1566b).
