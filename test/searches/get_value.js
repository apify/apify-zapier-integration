const zapier = require('zapier-platform-core');
const chai = require('chai');
const chaiAsPromised = require('chai-as-promised');
const {
    TEST_USER_TOKEN,
    apifyClient,
    randomString,
} = require('../helpers');

const { expect } = chai;
chai.use(chaiAsPromised);

const App = require('../../index');

const appTester = zapier.createAppTester(App);

describe('get key-value store value', () => {
    let testStoreId;

    before(async () => {
        // Create key-value store for testing
        const store = await apifyClient.keyValueStores()
            .getOrCreate(`test-zapier-${randomString()}`);
        testStoreId = store.id;
    });

    it('work for JSON with object structure', async () => {
        const storeKey = randomString();
        const storeValue = { key: 'value' };
        // Create record
        await apifyClient.keyValueStore(testStoreId)
            .setRecord({
                key: storeKey,
                contentType: 'application/json',
                value: storeValue,
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

        expect(storeValue)
            .to
            .be
            .eql(testResult[0]);
    })
        .timeout(10000);

    it('work for JSON without object structure', async () => {
        const storeKey = randomString();
        const storeValue = 'Just some text.';
        // Create record
        await apifyClient.keyValueStore(testStoreId)
            .setRecord({
                key: storeKey,
                contentType: 'application/json',
                value: storeValue,
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

        expect(storeValue)
            .to
            .be
            .eql(testResult[0].value);
    })
        .timeout(10000);

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

        expect(testResult)
            .to
            .be
            .eql([]);
    })
        .timeout(10000);

    it('work for pdf', async () => {
        const bundle = {
            authData: {
                access_token: TEST_USER_TOKEN,
            },
            inputData: {
                storeIdOrName: 'oDtbjvjH3vIjUYWsy', // TODO: move to test user account
                key: 'pdf',
            },
        };

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
                    + '"storeId":"oDtbjvjH3vIjUYWsy",'
                    + '"key":"pdf",'
                    + '"contentType":"application/pdf"'
                    + '}'
                    + '}|||hydrate',
            }]);
    })
        .timeout(10000);

    it('throw for file bigger than 120MB', async () => {
        const bundle = {
            authData: {
                access_token: TEST_USER_TOKEN,
            },
            inputData: {
                storeIdOrName: 'oDtbjvjH3vIjUYWsy', // TODO: move to test user account
                key: '200MBzip',
            },
        };

        await expect(appTester(App.searches.keyValueStoreGetValue.operation.perform, bundle))
            .to
            .be
            .rejectedWith(/File size exceeds Zapier operating constraints/);
    })
        .timeout(10000);

    after(async () => {
        await apifyClient.keyValueStore(testStoreId)
            .delete();
    });
});
