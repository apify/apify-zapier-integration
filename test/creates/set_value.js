const zapier = require('zapier-platform-core');
const { expect } = require('chai');
const { TEST_USER_TOKEN, apifyClient, randomString } = require('../helpers');
const { KEY_VALUE_STORE_SAMPLE } = require('../../src/consts');
const App = require('../../index');

const appTester = zapier.createAppTester(App);


describe('set key-value store value', () => {
    it('work for storeName', async () => {
        const expectedKey = randomString();
        const expectedValue = {
            myKey: randomString(),
        };
        const bundle = {
            authData: {
                token: TEST_USER_TOKEN,
            },
            inputData: {
                storeIdOrName: 'zapier-test',
                key: expectedKey,
                value: JSON.stringify(expectedValue),
            },
        };

        const testResult = await appTester(App.creates.keyValueStoreSetValue.operation.perform, bundle);

        const record = await apifyClient.keyValueStore(testResult.keyValueStore.id).getRecord(expectedKey);

        expect(expectedValue).to.be.eql(record.value);
        expect(testResult).to.include.all.keys(Object.keys(KEY_VALUE_STORE_SAMPLE));
    }).timeout(10000);

    it('work for storeId', async () => {
        const store = await apifyClient.keyValueStores().getOrCreate(`test-zapier-${randomString()}`);
        const expectedKey = randomString();
        const expectedValue = {
            myKey: randomString(),
        };
        const bundle = {
            authData: {
                token: TEST_USER_TOKEN,
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

        await apifyClient.keyValueStore(store.id).delete();
    }).timeout(10000);
});
