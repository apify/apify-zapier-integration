const zapier = require('zapier-platform-core');
const { expect } = require('chai');
const nock = require('nock');
const { TEST_USER_TOKEN, apifyClient, randomString } = require('../helpers');
const { DATASET_SAMPLE } = require('../../src/consts');

const App = require('../../index');

const appTester = zapier.createAppTester(App);

describe('fetch dataset items', () => {
    let testDatasetId = DATASET_SAMPLE.id;

    before(async () => {
        if (TEST_USER_TOKEN) {
            const dataset = await apifyClient.datasets().getOrCreate(`test-zapier-${randomString()}`);
            testDatasetId = dataset.id;
        }
    });

    after(async () => {
        if (TEST_USER_TOKEN) {
            await apifyClient.dataset(testDatasetId).delete();
        }
    });

    afterEach(async () => {
        if (!TEST_USER_TOKEN) {
            nock.cleanAll();
        }
    });

    it('work', async () => {
        const randomItems = [];
        for (let i = 0; i < 1000; i++) {
            randomItems.push({
                testKey: randomString(),
                i,
            });
        }

        if (TEST_USER_TOKEN) {
            // Push data to dataset
            await apifyClient.dataset(testDatasetId).pushItems(randomItems);
        }

        const bundle = {
            authData: {
                access_token: TEST_USER_TOKEN,
            },
            inputData: {
                datasetIdOrName: testDatasetId,
            },
        };

        let scope;
        if (!TEST_USER_TOKEN) {
            scope = nock('https://api.apify.com');
            scope.get(`/v2/datasets/${testDatasetId}`)
                .reply(200, {
                    data: DATASET_SAMPLE,
                });
            scope.get(`/v2/datasets/${testDatasetId}/items`)
                .query({ limit: null, offset: null, clean: true })
                .reply(200, randomItems);
        }

        const testResult = await appTester(App.searches.fetchDatasetItems.operation.perform, bundle);

        expect(testResult[0].items.length).to.be.eql(randomItems.length);
        expect(testResult[0]).to.include.all.keys(Object.keys(DATASET_SAMPLE));
        expect(testResult[0].itemsFileUrls).to.include.all.keys('xml', 'csv', 'json', 'xlsx', 'html', 'rss');

        scope?.done();
    }).timeout(120000);
});
