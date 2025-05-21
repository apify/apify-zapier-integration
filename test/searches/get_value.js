/* eslint-env mocha */
const zapier = require('zapier-platform-core');
const chai = require('chai');
const chaiAsPromised = require('chai-as-promised');
const nock = require('nock');

const { TEST_USER_TOKEN, apifyClient, randomString } = require('../helpers');
const App = require('../../index');
const { KEY_VALUE_STORE_SAMPLE} = require('../../src/consts');

const { expect } = chai;
chai.use(chaiAsPromised);

const appTester = zapier.createAppTester(App);

describe('get key-value store value', () => {
    let testStoreId = KEY_VALUE_STORE_SAMPLE.id;

    before(async () => {
        if (TEST_USER_TOKEN) {
            // Create key-value store for testing
            const store = await apifyClient.keyValueStores().getOrCreate(`test-zapier-${randomString()}`);
            testStoreId = store.id;
        }
    });

    after(async () => {
        if (TEST_USER_TOKEN) {
            await apifyClient.keyValueStore(testStoreId).delete();
        }
    });

    afterEach(async () => {
        if (!TEST_USER_TOKEN) {
            nock.cleanAll();
        }
    });

    it('work', async () => {
        const storeKey = randomString();
        const storeValue = {
            myKey: randomString(),
        };

        if (TEST_USER_TOKEN) {
            // Create record
            await apifyClient.keyValueStore(testStoreId).setRecord({
                key: storeKey,
                contentType: 'application/json',
                value: JSON.stringify(storeValue),
            });
        }

        const bundle = {
            authData: {
                access_token: TEST_USER_TOKEN,
            },
            inputData: {
                storeIdOrName: testStoreId,
                key: storeKey,
            },
        };

        let scope;
        if (!TEST_USER_TOKEN) {
            scope = nock('https://api.apify.com');
            scope.get(`/v2/key-value-stores/${TEST_USER_TOKEN}`)
                .reply(200, KEY_VALUE_STORE_SAMPLE);
            scope.get(`/v2/key-value-stores/${testStoreId}/records/${storeKey}`)
                .reply(200, storeValue);
        }

        const testResult = await appTester(App.searches.keyValueStoreGetValue.operation.perform, bundle);

        expect(storeValue).to.be.eql(testResult[0]);
        scope?.done();
    }).timeout(10000);

    it('throw error for non json value', async () => {
        const storeKey = randomString();

        if (TEST_USER_TOKEN) {
            // Create record
            await apifyClient.keyValueStore(testStoreId).setRecord({
                key: storeKey,
                contentType: 'plain/text',
                value: 'just text',
            });
        }

        const bundle = {
            authData: {
                access_token: TEST_USER_TOKEN,
            },
            inputData: {
                storeIdOrName: testStoreId,
                key: storeKey,
            },
        };

        let scope;
        if (!TEST_USER_TOKEN) {
            scope = nock('https://api.apify.com');
            scope.get(`/v2/key-value-stores/${testStoreId}`)
                .reply(200, KEY_VALUE_STORE_SAMPLE);
            scope.get(`/v2/key-value-stores/${testStoreId}/records/${storeKey}`)
                .reply(200, 'just text', {
                    'content-type': 'plain/text',
                });
        }

        await expect(appTester(App.searches.keyValueStoreGetValue.operation.perform, bundle)).to.be.rejectedWith(/is not JSON object/);
        scope?.done();
    }).timeout(10000);

    it('work for empty value', async () => {
        const storeKey = randomString();

        const bundle = {
            authData: {
                access_token: TEST_USER_TOKEN,
            },
            inputData: {
                storeIdOrName: testStoreId,
                key: storeKey,
            },
        };

        let scope;
        if (!TEST_USER_TOKEN) {
            scope = nock('https://api.apify.com');
            scope.get(`/v2/key-value-stores/${testStoreId}`)
                .reply(200, KEY_VALUE_STORE_SAMPLE);
            scope.get(`/v2/key-value-stores/${testStoreId}/records/${storeKey}`)
                .reply(404);
        }

        const testResult = await appTester(App.searches.keyValueStoreGetValue.operation.perform, bundle);

        expect(testResult).to.be.eql([]);
    }).timeout(10000);
});
