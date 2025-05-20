const zapier = require('zapier-platform-core');
const { expect } = require('chai');
const _ = require('lodash');
const nock = require('nock');
const { TEST_USER_TOKEN, apifyClient, createWebScraperTask, createLegacyCrawlerTask, randomString, getMockRun } = require('../helpers');
const { TASK_RUN_SAMPLE, KEY_VALUE_STORE_SAMPLE } = require('../../src/consts');

const App = require('../../index');

const appTester = zapier.createAppTester(App);

describe('create task run', () => {
    let testTask1Id = randomString();
    let testTask2Id = randomString();
    let testTask3Id = randomString();

    before(async () => {
        if (TEST_USER_TOKEN) {
            // Create task for testing
            const task1 = await createWebScraperTask();
            testTask1Id = task1.id;
            const task2 = await createWebScraperTask('() => ({ foo: "bar" })');
            testTask2Id = task2.id;
            const task3 = await createLegacyCrawlerTask('function pageFunction(context) { return { testedField: "testValue" } }');
            testTask3Id = task3.id;
        }
    });

    afterEach(async () => {
        if (!TEST_USER_TOKEN) {
            nock.cleanAll();
        }
    });

    after(async () => {
        if (TEST_USER_TOKEN) {
            await Promise.all(
                [testTask1Id, testTask2Id, testTask3Id].map((taskId) => apifyClient.task(taskId).delete()),
            );
        }
    });

    it('runSync work', async () => {
        const urlToScrape = 'http://example.com';
        const bundle = {
            authData: {
                access_token: TEST_USER_TOKEN,
            },
            inputData: {
                taskId: testTask1Id,
                runSync: true,
                rawInput: JSON.stringify({
                    startUrls: [
                        {
                            url: urlToScrape,
                        },
                    ],
                }),
            },
        };

        let scope;
        if (!TEST_USER_TOKEN) {
            const mockRun = getMockRun({ actorTaskId: testTask1Id });
            scope = nock('https://api.apify.com');
            scope.post(`/v2/actor-tasks/${testTask1Id}/runs`, { startUrls: [{ url: urlToScrape }] })
                .query({ waitForFinish: 120 })
                .reply(201, { data: mockRun });
            scope.get(`/v2/key-value-stores/${mockRun.defaultKeyValueStoreId}/records/OUTPUT`)
                .reply(200, KEY_VALUE_STORE_SAMPLE);
            scope.get(`/v2/datasets/${mockRun.defaultDatasetId}/items`)
                .query({ limit: 100, clean: true })
                .reply(200, [{ url: urlToScrape }]);
        }

        const testResult = await appTester(App.creates.createTaskRun.operation.perform, bundle);

        expect(testResult).to.have.any.keys(Object.keys(TASK_RUN_SAMPLE).concat(['isStatusMessageTerminal', 'statusMessage']));
        expect(testResult.status).to.be.eql('SUCCEEDED');
        expect(testResult.OUTPUT).to.not.equal(null);
        expect(testResult.datasetItems.length).to.be.at.least(1);
        expect(testResult.datasetItems[0].url).be.eql(urlToScrape);
        expect(testResult.finishedAt).to.not.equal(null);

        scope?.done();
    }).timeout(120000);

    it('runSync work without output', async () => {
        const bundle = {
            authData: {
                access_token: TEST_USER_TOKEN,
            },
            inputData: {
                taskId: testTask2Id,
                runSync: true,
            },
        };

        let scope;
        if (!TEST_USER_TOKEN) {
            const mockRun = getMockRun({ actorTaskId: testTask2Id });
            scope = nock('https://api.apify.com');
            scope.post(`/v2/actor-tasks/${testTask2Id}/runs`)
                .query({ waitForFinish: 120 })
                .reply(201, { data: mockRun });
            scope.get(`/v2/key-value-stores/${mockRun.defaultKeyValueStoreId}/records/OUTPUT`)
                .reply(200, { ...KEY_VALUE_STORE_SAMPLE, error: 'No output' });
            scope.get(`/v2/datasets/${mockRun.defaultDatasetId}/items`)
                .query({ limit: 100, clean: true })
                .reply(200, []);
        }

        const testResult = await appTester(App.creates.createTaskRun.operation.perform, bundle);

        expect(testResult.status).to.be.eql('SUCCEEDED');
        expect(testResult.OUTPUT).to.not.equal(null);
        expect(testResult.OUTPUT).to.have.property('error');
        expect(testResult.finishedAt).to.not.equal(null);

        scope?.done();
    }).timeout(120000);

    it('runAsync work', async () => {
        const bundle = {
            authData: {
                access_token: TEST_USER_TOKEN,
            },
            inputData: {
                taskId: testTask1Id,
                runSync: false,
            },
        };

        let scope;
        if (!TEST_USER_TOKEN) {
            const mockRun = getMockRun({ actorTaskId: testTask1Id, finishedAt: null });
            delete mockRun.exitCode;
            delete mockRun.consoleUrl;

            scope = nock('https://api.apify.com');
            scope.post(`/v2/actor-tasks/${testTask1Id}/runs`)
                .reply(201, { data: mockRun });
            scope.get(`/v2/key-value-stores/${mockRun.defaultKeyValueStoreId}/records/OUTPUT`)
                .reply(200, KEY_VALUE_STORE_SAMPLE);
            scope.get(`/v2/datasets/${mockRun.defaultDatasetId}/items`)
                .query({ limit: 100, clean: true })
                .reply(200, [{ url: 'http://example.com' }]);
        }

        const testResult = await appTester(App.creates.createTaskRun.operation.perform, bundle);
        expect(testResult).to.have.all.keys(_.without(Object.keys(TASK_RUN_SAMPLE), 'exitCode', 'consoleUrl'));
        expect(testResult.finishedAt).to.be.eql(null);

        scope?.done();
    }).timeout(50000);

    it('run legacy crawler and return simplified items work', async () => {
        const bundle = {
            authData: {
                access_token: TEST_USER_TOKEN,
            },
            inputData: {
                taskId: testTask3Id,
                runSync: true,
            },
        };

        let scope;
        if (!TEST_USER_TOKEN) {
            const mockRun = getMockRun({ actorTaskId: testTask3Id });

            scope = nock('https://api.apify.com');
            scope.post(`/v2/actor-tasks/${testTask3Id}/runs`)
                .query({ waitForFinish: 120 })
                .reply(201, { data: mockRun });
            scope.get(`/v2/key-value-stores/${mockRun.defaultKeyValueStoreId}/records/OUTPUT`)
                .reply(200, KEY_VALUE_STORE_SAMPLE);
            scope.get(`/v2/datasets/${mockRun.defaultDatasetId}/items`)
                .query({ limit: 100, clean: true })
                .reply(200, [{ testedField: 'testValue' }]);
        }

        const testResult = await appTester(App.creates.createTaskRun.operation.perform, bundle);
        expect(testResult.datasetItems[0].testedField).be.eql('testValue');

        scope?.done();
    }).timeout(240000);
});
