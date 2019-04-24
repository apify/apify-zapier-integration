const zapier = require('zapier-platform-core');
const { expect } = require('chai');
const { TEST_USER_TOKEN, apifyClient, randomString } = require('../helpers');
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

        const record = await apifyClient.keyValueStores.getRecord({
            storeId: testResult.keyValueStore.id,
            key: expectedKey,
        });

        expect(expectedValue).to.be.eql(record.body);
    }).timeout(10000);

    it('work for storeId', async () => {
        const store = await apifyClient.keyValueStores.getOrCreateStore({ storeName: `test-zapier-${randomString()}` });
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

        const record = await apifyClient.keyValueStores.getRecord({
            storeId: store.id,
            key: expectedKey,
        });

        expect(expectedValue).to.be.eql(record.body);

        await apifyClient.keyValueStores.deleteStore({ storeId: store.id });
    }).timeout(10000);
});
