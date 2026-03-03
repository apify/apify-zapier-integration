/* eslint-env mocha */
const zapier = require('zapier-platform-core');
const { expect } = require('chai');
const nock = require('nock');
const { TEST_USER_TOKEN, apifyClient, randomString, getMockDataset, mockDatasetPublicUrl} = require('../helpers');
const { DATASET_SAMPLE } = require('../../src/consts');

const App = require('../../index');

const appTester = zapier.createAppTester(App);

describe('fetch dataset items', () => {
    let testDatasetId = randomString();

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

    it('passes fields param to API when fields option is set', async () => {
        if (TEST_USER_TOKEN) return; // Only run with nock mocks

        const fields = 'name, url';
        const filteredItems = [{ name: 'test', url: 'https://example.com' }];

        const bundle = {
            authData: { access_token: TEST_USER_TOKEN },
            inputData: {
                datasetIdOrName: testDatasetId,
                fields,
            },
        };

        const scope = nock('https://api.apify.com');
        scope.get(`/v2/datasets/${testDatasetId}`)
            .reply(200, { data: getMockDataset({ id: testDatasetId }) });
        scope.get(`/v2/datasets/${testDatasetId}/items`)
            .query({ limit: null, offset: null, clean: true, fields: 'name,url' })
            .reply(200, filteredItems);
        scope.get(`/v2/datasets/${testDatasetId}`)
            .reply(200, mockDatasetPublicUrl(testDatasetId));

        const testResult = await appTester(App.searches.fetchDatasetItems.operation.perform, bundle);

        expect(testResult[0].items).to.eql(filteredItems);
        scope.done();
    });

    it('passes omit param to API when omit option is set', async () => {
        if (TEST_USER_TOKEN) return; // Only run with nock mocks

        const omit = '_id, _debugInfo';
        const filteredItems = [{ name: 'test', url: 'https://example.com' }];

        const bundle = {
            authData: { access_token: TEST_USER_TOKEN },
            inputData: {
                datasetIdOrName: testDatasetId,
                omit,
            },
        };

        const scope = nock('https://api.apify.com');
        scope.get(`/v2/datasets/${testDatasetId}`)
            .reply(200, { data: getMockDataset({ id: testDatasetId }) });
        scope.get(`/v2/datasets/${testDatasetId}/items`)
            .query({ limit: null, offset: null, clean: true, omit: '_id,_debugInfo' })
            .reply(200, filteredItems);
        scope.get(`/v2/datasets/${testDatasetId}`)
            .reply(200, mockDatasetPublicUrl(testDatasetId));

        const testResult = await appTester(App.searches.fetchDatasetItems.operation.perform, bundle);

        expect(testResult[0].items).to.eql(filteredItems);
        scope.done();
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
                    data: getMockDataset({ id: testDatasetId, items: 1000, cleanItems: 1000 }),
                });
            scope.get(`/v2/datasets/${testDatasetId}/items`)
                .query({ limit: null, offset: null, clean: true })
                .reply(200, randomItems);
            scope.get(`/v2/datasets/${testDatasetId}`)
                .reply(200, mockDatasetPublicUrl(testDatasetId));
        }

        const testResult = await appTester(App.searches.fetchDatasetItems.operation.perform, bundle);

        expect(testResult[0].items.length).to.be.eql(randomItems.length);
        expect(testResult[0]).to.include.all.keys(Object.keys(DATASET_SAMPLE));
        expect(testResult[0].itemsFileUrls).to.include.all.keys('xml', 'csv', 'json', 'xlsx', 'html', 'rss');

        scope?.done();
    }).timeout(120000);
});
