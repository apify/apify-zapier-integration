/* eslint-env mocha */
const zapier = require('zapier-platform-core');
const chai = require('chai');
const chaiAsPromised = require('chai-as-promised');
const nock = require('nock');

const { TEST_USER_TOKEN, apifyClient, randomString, getMockKVStore} = require('../helpers');
const App = require('../../index');

const { expect } = chai;
chai.use(chaiAsPromised);

const appTester = zapier.createAppTester(App);

describe('get key-value store value', () => {
    let testStoreId = randomString();

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

    it('work for JSON with object structure', async () => {
        const storeKey = randomString();
        const storeValue = { key: 'value' };

        if (TEST_USER_TOKEN) {
            // Create record
            await apifyClient.keyValueStore(testStoreId).setRecord({
                key: storeKey,
                contentType: 'application/json',
                value: storeValue,
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
                .reply(200, { data: getMockKVStore({ id: testStoreId }) });
            scope.head(`/v2/key-value-stores/${testStoreId}/records/${storeKey}`)
                .reply(200, undefined, {
                    'content-type': 'application/json',
                    'content-length': Buffer.byteLength(JSON.stringify(storeValue)),
                });
            scope.get(`/v2/key-value-stores/${testStoreId}/records/${storeKey}`)
                .reply(200, storeValue);
        }

        const testResult = await appTester(App.searches.keyValueStoreGetValue.operation.perform, bundle);

        expect(storeValue).to.be.eql(testResult[0]);
        scope?.done();
    }).timeout(10000);

    it('work for JSON without object structure', async () => {
        const storeKey = randomString();
        const storeValue = 'Just some text.';

        if (TEST_USER_TOKEN) {
            // Create record
            await apifyClient.keyValueStore(testStoreId)
                .setRecord({
                    key: storeKey,
                    contentType: 'application/json',
                    value: storeValue,
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
                .reply(200, { data: getMockKVStore({ id: testStoreId }) });
            scope.head(`/v2/key-value-stores/${testStoreId}/records/${storeKey}`)
                .reply(200, undefined, {
                    'content-type': 'application/json',
                    'content-length': Buffer.byteLength(JSON.stringify(storeValue)),
                });
            scope.get(`/v2/key-value-stores/${testStoreId}/records/${storeKey}`)
                .reply(200, `"${storeValue}"`, {
                    'content-type': 'application/json',
                });
        }

        const testResult = await appTester(App.searches.keyValueStoreGetValue.operation.perform, bundle);

        expect(storeValue).to.be.eql(testResult[0].value);

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
                .reply(200, { data: getMockKVStore({ id: testStoreId }) });
            scope.head(`/v2/key-value-stores/${testStoreId}/records/${storeKey}`)
                .reply(404);
        }

        const testResult = await appTester(App.searches.keyValueStoreGetValue.operation.perform, bundle);

        expect(testResult).to.be.eql([]);
        scope?.done();
    }).timeout(10000);

    it('work for pdf', async () => {
        const storeId = 'oDtbjvjH3vIjUYWsy'; // TODO: move to test user account

        const bundle = {
            authData: {
                access_token: TEST_USER_TOKEN,
            },
            inputData: {
                storeIdOrName: storeId,
                key: 'pdf',
            },
        };

        let scope;
        if (!TEST_USER_TOKEN) {
            scope = nock('https://api.apify.com');
            scope.get(`/v2/key-value-stores/${storeId}`)
                .reply(200, { data: getMockKVStore({ id: storeId }) });
            scope.head(`/v2/key-value-stores/${storeId}/records/pdf`)
                .reply(200, undefined, {
                    'content-type': 'application/pdf',
                    'content-length': 196420, // Example size
                });
        }

        const testResult = await appTester(App.searches.keyValueStoreGetValue.operation.perform, bundle);

        expect(testResult)
            .to
            .be
            .eql([{
                contentType: 'application/pdf',
                value: 'hydrate|||{'
                    + '"type":"file",'
                    + '"method":"hydrators.stashFunction",'
                    + '"bundle":{'
                    + `"storeId":"${storeId}",`
                    + '"key":"pdf",'
                    + '"contentType":"application/pdf"'
                    + '}'
                    + '}|||hydrate',
            }]);

        scope?.done();
    }).timeout(10000);

    it('throw for file bigger than 120MB', async () => {
        const storeId = 'oDtbjvjH3vIjUYWsy'; // TODO: move to test user account

        const bundle = {
            authData: {
                access_token: TEST_USER_TOKEN,
            },
            inputData: {
                storeIdOrName: storeId,
                key: '200MBzip',
            },
        };

        let scope;
        if (!TEST_USER_TOKEN) {
            scope = nock('https://api.apify.com');
            scope.get(`/v2/key-value-stores/${storeId}`)
                .reply(200, { data: getMockKVStore({ id: storeId }) });
            scope.head(`/v2/key-value-stores/${storeId}/records/200MBzip`)
                .reply(200, undefined, {
                    'content-type': 'application/zip',
                    'content-length': 222282476, // 200MB
                });
        }

        await expect(appTester(App.searches.keyValueStoreGetValue.operation.perform, bundle))
            .to
            .be
            .rejectedWith(/File size exceeds Zapier operating constraints/);

        scope?.done();
    }).timeout(10000);
});
