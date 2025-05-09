const zapier = require('zapier-platform-core');
const chai = require('chai');
const chaiAsPromised = require('chai-as-promised');
const { TEST_USER_TOKEN, apifyClient, randomString } = require('../helpers');

const { expect } = chai;
chai.use(chaiAsPromised);

const App = require('../../index');

const appTester = zapier.createAppTester(App);

describe('get key-value store value', () => {
    let testStoreId;

    before(async () => {
        // Create key-value store for testing
        const store = await apifyClient.keyValueStores().getOrCreate(`test-zapier-${randomString()}`);
        testStoreId = store.id;
    });

    it('work', async () => {
        const storeKey = randomString();
        const storeValue = {
            myKey: randomString(),
        };
        // Create record
        await apifyClient.keyValueStore(testStoreId).setRecord({
            key: storeKey,
            contentType: 'application/json',
            value: JSON.stringify(storeValue),
        });

        const bundle = {
            authData: {
                access_token: TEST_USER_TOKEN,
            },
            inputData: {
                storeIdOrName: testStoreId,
                key: storeKey,
            },
        };

        const testResult = await appTester(App.searches.keyValueStoreGetValue.operation.perform, bundle);

        expect(storeValue).to.be.eql(testResult[0]);
    }).timeout(10000);

    it('throw error for non json value', async () => {
        const storeKey = randomString();
        // Create record
        await apifyClient.keyValueStore(testStoreId).setRecord({
            key: storeKey,
            contentType: 'plain/text',
            value: 'just text',
        });

        const bundle = {
            authData: {
                access_token: TEST_USER_TOKEN,
            },
            inputData: {
                storeIdOrName: testStoreId,
                key: storeKey,
            },
        };

        await expect(appTester(App.searches.keyValueStoreGetValue.operation.perform, bundle)).to.be.rejectedWith(/is not JSON object/);
    }).timeout(10000);

    it('work for empty value', async () => {
        const bundle = {
            authData: {
                access_token: TEST_USER_TOKEN,
            },
            inputData: {
                storeIdOrName: testStoreId,
                key: 'does-not-exist',
            },
        };

        const testResult = await appTester(App.searches.keyValueStoreGetValue.operation.perform, bundle);

        expect(testResult).to.be.eql([]);
    }).timeout(10000);

    after(async () => {
        await apifyClient.keyValueStore(testStoreId).delete();
    });
});
