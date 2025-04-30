const { expect } = require('chai');
const zapier = require('zapier-platform-core');
const chai = require('chai');
const chaiAsPromised = require('chai-as-promised');
const { TEST_USER_TOKEN, apifyClient } = require('../helpers');
const App = require('../../index');
const { SCRAPE_SINGLE_URL_RUN_SAMPLE } = require('../../src/consts');

const appTester = zapier.createAppTester(App);

chai.use(chaiAsPromised);

describe('scrape single URL', () => {
    it('runs scrape single URL with correct output fields', async () => {
        const options = {
            url: 'https://www.example.com',
            crawlerType: 'cheerio',
        };
        const bundle = {
            authData: {
                access_token: TEST_USER_TOKEN,
            },
            inputData: options,
        };

        const testResult = await appTester(App.creates.scrapeSingleUrl.operation.perform, bundle);
        const scrapeSingleUrlRun = await apifyClient.run(testResult.id).get();
        const datasetClient = await apifyClient.dataset(scrapeSingleUrlRun.defaultDatasetId);
        const datasetItems = await datasetClient.listItems({ limit: 1 });
        const kvsClient = await apifyClient.keyValueStore(scrapeSingleUrlRun.defaultKeyValueStoreId);
        const input = await kvsClient.getRecord('INPUT');

        expect(testResult).to.have.all.keys(Object.keys(SCRAPE_SINGLE_URL_RUN_SAMPLE));
        expect(scrapeSingleUrlRun.status).to.be.eql('SUCCEEDED');
        // Run scraper just one single URL
        expect(datasetItems.items.length).to.be.eql(1);

        // Correctly set type of crawler
        expect(input.value.crawlerType).to.be.eql(options.crawlerType);

        // Check that output fields are correct
        const result = datasetItems.items[0];
        expect(testResult.pageUrl).to.be.eql(result.url);
        expect(testResult.pageContent).to.be.eql({
            html: result.html,
            markdown: result.markdown,
            text: result.text,
        });
        expect(testResult.pageMetadata).to.be.eql(result.metadata);
    }).timeout(60000);

    it('throws if there are no data', async () => {
        const options = {
            url: 'https://www.zz-this-page-doesn-not-exists-xx.com',
            crawlerType: 'cheerio',
        };
        const bundle = {
            authData: {
                access_token: TEST_USER_TOKEN,
            },
            inputData: options,
        };
        await expect(appTester(App.creates.scrapeSingleUrl.operation.perform, bundle)).to.be.rejectedWith(/page content is missing/);
    }).timeout(65000);
});
