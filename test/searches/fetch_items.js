const zapier = require('zapier-platform-core');
const { expect } = require('chai');
const { TEST_USER_TOKEN, apifyClient, randomString } = require('../helpers');
const { DATASET_SAMPLE } = require('../../src/consts');

const App = require('../../index');

const appTester = zapier.createAppTester(App);


describe('fetch dataset items', () => {
    let testDatasetId;

    before(async () => {
        const dataset = await apifyClient.datasets().getOrCreate(`test-zapier-${randomString()}`);
        testDatasetId = dataset.id;
    });

    it('work', async () => {
        const randomItems = [];
        for (let i = 0; i < 1000; i++) {
            randomItems.push({
                testKey: randomString(),
                i,
            });
        }
        // Push data to dataset
        await apifyClient.dataset(testDatasetId).pushItems(randomItems);

        const bundle = {
            authData: {
                token: TEST_USER_TOKEN,
            },
            inputData: {
                datasetIdOrName: testDatasetId,
            },
        };

        const testResult = await appTester(App.searches.fetchDatasetItems.operation.perform, bundle);

        expect(testResult[0].items.length).to.be.eql(randomItems.length);
        expect(testResult[0]).to.include.all.keys(Object.keys(DATASET_SAMPLE));
        expect(testResult[0].itemsFileUrls).to.include.all.keys('xml', 'csv', 'json', 'xlsx', 'html', 'rss');
    }).timeout(120000);

    after(async () => {
        await apifyClient.dataset(testDatasetId).delete();
    });
});
