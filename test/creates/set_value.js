const zapier = require('zapier-platform-core');
const { expect } = require('chai');
const nock = require('nock');
const { TEST_USER_TOKEN, apifyClient, randomString } = require('../helpers');
const { KEY_VALUE_STORE_SAMPLE } = require('../../src/consts');
const App = require('../../index');

const appTester = zapier.createAppTester(App);

const getMockKVStore = (storeName) => ({
    id: randomString(),
    name: storeName,
    userId: randomString(),
    username: randomString(),
    createdAt: '2019-12-12T07:34:14.202Z',
    modifiedAt: '2019-12-13T08:36:13.202Z',
    accessedAt: '2019-12-14T08:36:13.202Z',
    actId: null,
    actRunId: null,
    consoleUrl: 'https://console.apify.com/storage/key-value-stores/27TmTznX9YPeAYhkC',
    stats: {
        readCount: 9,
        writeCount: 3,
        deleteCount: 6,
        listCount: 2,
        s3StorageBytes: 18,
    },
});

describe('set key-value store value', () => {
    afterEach(async () => {
        if (!TEST_USER_TOKEN) {
            nock.cleanAll();
        }
    });

    it('work for storeName', async () => {
        const storeName = 'zapier-test';
        const expectedKey = randomString();
        const expectedValue = {
            myKey: randomString(),
        };
        const bundle = {
            authData: {
                access_token: TEST_USER_TOKEN,
            },
            inputData: {
                storeIdOrName: storeName,
                key: expectedKey,
                value: JSON.stringify(expectedValue),
            },
        };

        let scope;
        if (!TEST_USER_TOKEN) {
            const mockKVStore = getMockKVStore(storeName);
            scope = nock('https://api.apify.com');
            scope.put(`/v2/key-value-stores/${mockKVStore.id}/records/${expectedKey}`, JSON.stringify(expectedValue))
                .reply(201);
            scope.get(`/v2/key-value-stores/${storeName}`)
                .reply(200, {
                    data: mockKVStore,
                });
            scope.get(`/v2/key-value-stores/${mockKVStore.id}/records/${expectedKey}`)
                .reply(200, expectedValue);
        }

        const testResult = await appTester(App.creates.keyValueStoreSetValue.operation.perform, bundle);

        const record = await apifyClient.keyValueStore(testResult.keyValueStore.id).getRecord(expectedKey);

        expect(expectedValue).to.be.eql(record.value);
        expect(testResult).to.include.all.keys(Object.keys(KEY_VALUE_STORE_SAMPLE));
        scope?.done();
    }).timeout(10000);

    it('work for storeId', async () => {
        const storeName = `test-zapier-${randomString()}`;
        const expectedKey = randomString();
        const expectedValue = {
            myKey: randomString(),
        };

        let scope;
        if (!TEST_USER_TOKEN) {
            const mockKVStore = getMockKVStore(storeName);
            scope = nock('https://api.apify.com');
            scope.post('/v2/key-value-stores')
                .query({ name: storeName })
                .reply(201, { data: mockKVStore });
            scope.put(`/v2/key-value-stores/${mockKVStore.id}/records/${expectedKey}`, JSON.stringify(expectedValue))
                .reply(201);
            scope.get(`/v2/key-value-stores/${mockKVStore.id}`)
                .reply(200, {
                    data: mockKVStore,
                });
            scope.get(`/v2/key-value-stores/${mockKVStore.id}/records/${expectedKey}`)
                .reply(200, expectedValue);
        }

        const store = await apifyClient.keyValueStores().getOrCreate(storeName);

        const bundle = {
            authData: {
                access_token: TEST_USER_TOKEN,
            },
            inputData: {
                storeIdOrName: store.id,
                key: expectedKey,
                value: JSON.stringify(expectedValue),
            },
        };

        await appTester(App.creates.keyValueStoreSetValue.operation.perform, bundle);

        const record = await apifyClient.keyValueStore(store.id).getRecord(expectedKey);

        expect(expectedValue).to.be.eql(record.value);

        if (TEST_USER_TOKEN) {
            await apifyClient.keyValueStore(store.id).delete();
        }

        scope?.done();
    }).timeout(10000);
});
