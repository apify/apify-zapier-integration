/* eslint-env mocha */
const zapier = require('zapier-platform-core');
const chai = require('chai');
const chaiAsPromised = require('chai-as-promised');
const _ = require('lodash');
const nock = require('nock');
const { WEBHOOK_EVENT_TYPES } = require('@apify/consts');
const { TEST_USER_TOKEN,
    apifyClient,
    createWebScraperTask,
    createLegacyCrawlerTask,
    randomString,
    getMockRun,
    mockDatasetPublicUrl,
    TEST_CALLBACK_URL,
    parseRunCallbackWebhookParam,
    performAndResume,
} = require('../helpers');
const { TASK_RUN_SAMPLE, KEY_VALUE_STORE_SAMPLE, DEFAULT_SYNC_RUN_TIMEOUT_SECS } = require('../../src/consts');

const App = require('../../index');

chai.use(chaiAsPromised);
const { expect } = chai;

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
    }).timeout(5000);

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
        let webhooksParam;
        if (!TEST_USER_TOKEN) {
            const mockRun = getMockRun({ actorTaskId: testTask1Id });
            scope = nock('https://api.apify.com').persist();
            scope.get(`/v2/actor-tasks/${testTask1Id}`)
                .reply(200, { data: { id: testTask1Id, options: { timeoutSecs: 300 } } });
            scope.post(`/v2/actor-tasks/${mockRun.actorTaskId}/runs`, { startUrls: [{ url: urlToScrape }] })
                .query((query) => {
                    webhooksParam = query.webhooks;
                    // The task's own timeout caps the wait.
                    return query.timeout === '300' && !!query.webhooks;
                })
                .reply(201, { data: mockRun });
            scope.get(`/v2/actor-runs/${mockRun.id}`)
                .reply(200, { data: { ...mockRun, status: 'SUCCEEDED' } });
            scope.get(`/v2/key-value-stores/${mockRun.defaultKeyValueStoreId}/records/OUTPUT`)
                .reply(200, KEY_VALUE_STORE_SAMPLE);
            scope.get(`/v2/datasets/${mockRun.defaultDatasetId}/items`)
                .query({ limit: 1, clean: true })
                .reply(200, [{ url: urlToScrape }]);
            scope.get(`/v2/datasets/${mockRun.defaultDatasetId}/items`)
                .query({ limit: 100, clean: true })
                .reply(200, [{ url: urlToScrape }]);
            scope.get(`/v2/datasets/${mockRun.defaultDatasetId}`)
                .reply(200, mockDatasetPublicUrl(mockRun.defaultDatasetId));
        }

        const testResult = await performAndResume(appTester, App.creates.createTaskRun, bundle);

        if (!TEST_USER_TOKEN) {
            expect(parseRunCallbackWebhookParam(webhooksParam)).to.be.eql([{
                eventTypes: [
                    WEBHOOK_EVENT_TYPES.ACTOR_RUN_SUCCEEDED,
                    WEBHOOK_EVENT_TYPES.ACTOR_RUN_FAILED,
                    WEBHOOK_EVENT_TYPES.ACTOR_RUN_TIMED_OUT,
                    WEBHOOK_EVENT_TYPES.ACTOR_RUN_ABORTED,
                ],
                requestUrl: TEST_CALLBACK_URL,
            }]);
        }
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
            const mockRun = getMockRun({ actorTaskId: testTask2Id, status: 'READY' });
            scope = nock('https://api.apify.com').persist();
            scope.get(`/v2/actor-tasks/${testTask2Id}`)
                .reply(200, { data: { id: testTask2Id, actId: mockRun.actId, options: {} } });
            scope.get(`/v2/acts/${mockRun.actId}`)
                .reply(200, { data: { id: mockRun.actId, defaultRunOptions: { timeoutSecs: 300 } } });
            scope.post(`/v2/actor-tasks/${mockRun.actorTaskId}/runs`)
                // A task without its own timeout inherits the Actor's default.
                .query((query) => query.timeout === '300' && !!query.webhooks)
                .reply(201, { data: mockRun });
            scope.get(`/v2/actor-runs/${mockRun.id}`)
                .reply(200, { data: { ...mockRun, status: 'SUCCEEDED' } });
            scope.get(`/v2/key-value-stores/${mockRun.defaultKeyValueStoreId}/records/OUTPUT`)
                .reply(200, { ...KEY_VALUE_STORE_SAMPLE, error: 'No output' });
            scope.get(`/v2/datasets/${mockRun.defaultDatasetId}/items`)
                .query({ limit: 1, clean: true })
                .reply(200, []);
            scope.get(`/v2/datasets/${mockRun.defaultDatasetId}/items`)
                .query({ limit: 100, clean: true })
                .reply(200, []);
            scope.get(`/v2/datasets/${mockRun.defaultDatasetId}`)
                .reply(200, mockDatasetPublicUrl(mockRun.defaultDatasetId));
        }

        const testResult = await performAndResume(appTester, App.creates.createTaskRun, bundle);

        expect(testResult.status).to.be.eql('SUCCEEDED');
        expect(testResult.OUTPUT).to.not.equal(null);
        expect(testResult.OUTPUT).to.have.property('error');
        expect(testResult.finishedAt).to.not.equal(null);

        scope?.done();
    }).timeout(180000);

    it('runSync caps the timeout when neither the task nor the Actor sets one', async function () {
        if (TEST_USER_TOKEN) this.skip();

        const mockRun = getMockRun({ actorTaskId: testTask2Id });
        const bundle = {
            authData: { access_token: randomString() },
            inputData: { taskId: testTask2Id, runSync: true },
        };

        const scope = nock('https://api.apify.com');
        scope.get(`/v2/actor-tasks/${testTask2Id}`)
            .reply(200, { data: { id: testTask2Id, actId: mockRun.actId, options: {} } });
        scope.get(`/v2/acts/${mockRun.actId}`)
            .reply(200, { data: { id: mockRun.actId, defaultRunOptions: { timeoutSecs: 0 } } });
        scope.post(`/v2/actor-tasks/${testTask2Id}/runs`)
            .query((query) => query.timeout === `${DEFAULT_SYNC_RUN_TIMEOUT_SECS}` && !!query.webhooks)
            .reply(201, { data: mockRun });

        const startedRun = await appTester(App.creates.createTaskRun.operation.perform, bundle);

        expect(startedRun.id).to.be.eql(mockRun.id);

        scope.done();
    });

    const buildResumeBundle = (run) => ({
        authData: { access_token: randomString() },
        inputData: { taskId: testTask1Id, runSync: true },
        outputData: { id: run.id },
    });

    it('performResume rejects a timed out run', async function () {
        if (TEST_USER_TOKEN) this.skip();

        const timedOutRun = getMockRun({ actorTaskId: testTask1Id, status: 'TIMED-OUT', options: { timeoutSecs: 300 } });
        const scope = nock('https://api.apify.com');
        scope.get(`/v2/actor-runs/${timedOutRun.id}`)
            .reply(200, { data: timedOutRun });

        await expect(appTester(App.creates.createTaskRun.operation.performResume, buildResumeBundle(timedOutRun)))
            .to.be.rejectedWith(new RegExp(`did not finish within the 300s timeout and was stopped \\(run ID: ${timedOutRun.id}\\)`));

        scope.done();
    });

    it('performResume passes a failed run through', async function () {
        if (TEST_USER_TOKEN) this.skip();

        const failedRun = getMockRun({ actorTaskId: testTask1Id, status: 'FAILED' });
        const scope = nock('https://api.apify.com');
        scope.get(`/v2/actor-runs/${failedRun.id}`)
            .reply(200, { data: failedRun });
        scope.get(`/v2/key-value-stores/${failedRun.defaultKeyValueStoreId}/records/OUTPUT`)
            .reply(200, KEY_VALUE_STORE_SAMPLE);
        scope.get(`/v2/datasets/${failedRun.defaultDatasetId}/items`)
            .query({ limit: 1, clean: true })
            .reply(200, [{ url: 'http://example.com' }]);
        scope.get(`/v2/datasets/${failedRun.defaultDatasetId}/items`)
            .query({ limit: 100, clean: true })
            .reply(200, [{ url: 'http://example.com' }]);
        scope.get(`/v2/datasets/${failedRun.defaultDatasetId}`)
            .reply(200, mockDatasetPublicUrl(failedRun.defaultDatasetId));

        const testResult = await appTester(App.creates.createTaskRun.operation.performResume, buildResumeBundle(failedRun));

        expect(testResult.status).to.be.eql('FAILED');

        scope.done();
    });

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
                .query({ limit: 1, clean: true })
                .reply(200, [{ url: 'http://example.com' }]);
            scope.get(`/v2/datasets/${mockRun.defaultDatasetId}/items`)
                .query({ limit: 100, clean: true })
                .reply(200, [{ url: 'http://example.com' }]);
            scope.get(`/v2/datasets/${mockRun.defaultDatasetId}`)
                .reply(200, mockDatasetPublicUrl(mockRun.defaultDatasetId));
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
            scope.get(`/v2/actor-tasks/${testTask3Id}`)
                .reply(200, { data: { id: testTask3Id, options: { timeoutSecs: 300 } } });
            scope.post(`/v2/actor-tasks/${mockRun.actorTaskId}/runs`)
                .query((query) => query.timeout === '300' && !!query.webhooks)
                .reply(201, { data: mockRun });
            scope.get(`/v2/actor-runs/${mockRun.id}`)
                .reply(200, { data: { ...mockRun, status: 'SUCCEEDED' } });
            scope.get(`/v2/key-value-stores/${mockRun.defaultKeyValueStoreId}/records/OUTPUT`)
                .reply(200, KEY_VALUE_STORE_SAMPLE);
            scope.get(`/v2/datasets/${mockRun.defaultDatasetId}/items`)
                .query({ limit: 1, clean: true })
                .reply(200, [{ testedField: 'testValue' }]);
            scope.get(`/v2/datasets/${mockRun.defaultDatasetId}/items`)
                .query({ limit: 100, clean: true })
                .reply(200, [{ testedField: 'testValue' }]);
            scope.get(`/v2/datasets/${mockRun.defaultDatasetId}`)
                .reply(200, mockDatasetPublicUrl(mockRun.defaultDatasetId));
        }

        const testResult = await performAndResume(appTester, App.creates.createTaskRun, bundle);
        expect(testResult.datasetItems[0].testedField).be.eql('testValue');

        scope?.done();
    }).timeout(240000);

    it('throws a descriptive error with the parser detail for invalid input JSON overrides', async () => {
        const bundle = {
            authData: {
                access_token: TEST_USER_TOKEN,
            },
            inputData: {
                taskId: randomString(),
                rawInput: '{ "invalid": ',
                runSync: false,
            },
        };

        // JSON validated before any request, so no nock scope needed.
        await expect(appTester(App.creates.createTaskRun.operation.perform, bundle))
            .to.be.rejectedWith(/Input JSON overrides" field is not valid JSON:/);
    });
});
