const zapier = require('zapier-platform-core');
const { ACTOR_JOB_STATUSES } = require('@apify/consts');
const { expect } = require('chai');
const nock = require('nock');
const { apifyClient, createWebScraperTask, TEST_USER_TOKEN, getMockTaskRun } = require('../helpers');

const App = require('../../index');
const { KEY_VALUE_STORE_SAMPLE } = require('../../src/consts');

const appTester = zapier.createAppTester(App);

describe('search task last run', () => {
    let testTaskId = 'test_task-id';

    before(async () => {
        if (TEST_USER_TOKEN) {
            this.timeout(120000); // We need time to build actor
            // Create task for testing
            const task = await createWebScraperTask();
            testTaskId = task.id;
        }
    });

    after(async () => {
        if (TEST_USER_TOKEN) {
            await apifyClient.task(testTaskId).delete();
        }
    });

    afterEach(async () => {
        if (!TEST_USER_TOKEN) {
            nock.cleanAll();
        }
    });

    it('work for task without run', async () => {
        const bundle = {
            authData: {
                access_token: TEST_USER_TOKEN,
            },
            inputData: {
                taskId: testTaskId,
                status: ACTOR_JOB_STATUSES.SUCCEEDED,
            },
        };

        let scope;
        if (!TEST_USER_TOKEN) {
            scope = nock('https://api.apify.com')
                .get(`/v2/actor-tasks/${testTaskId}/runs/last`)
                .query({ status: ACTOR_JOB_STATUSES.SUCCEEDED })
                .reply(404, 'Run not found');
        }

        const testResult = await appTester(App.searches.searchTaskRun.operation.perform, bundle);

        expect(testResult.length).to.be.eql(0);
        scope?.done();
    }).timeout(240000);

    it('work', async () => {
        const bundle = {
            authData: {
                access_token: TEST_USER_TOKEN,
            },
            inputData: {
                taskId: testTaskId,
                status: ACTOR_JOB_STATUSES.SUCCEEDED,
            },
        };

        let taskRun;
        let scope;
        if (!TEST_USER_TOKEN) {
            taskRun = getMockTaskRun();

            scope = nock('https://api.apify.com');
            scope.get(`/v2/actor-tasks/${testTaskId}/runs/last`)
                .query({ status: ACTOR_JOB_STATUSES.SUCCEEDED })
                .reply(200, taskRun);

            scope.get(`/v2/key-value-stores/${taskRun.defaultKeyValueStoreId}/records/OUTPUT`)
                .reply(200, KEY_VALUE_STORE_SAMPLE);

            scope.get(`/v2/datasets/${taskRun.defaultDatasetId}/items`)
                .query({ limit: 100, clean: true })
                .reply(200, [{ foo: 'bar' }]);
        } else {
            taskRun = await apifyClient.task(testTaskId).call({
                waitSecs: 120,
            });
        }

        const testResult = await appTester(App.searches.searchTaskRun.operation.perform, bundle);

        expect(testResult[0].status).to.be.eql(ACTOR_JOB_STATUSES.SUCCEEDED);
        expect(testResult[0].id).to.be.eql(taskRun.id);
        scope?.done();
    }).timeout(240000);

    it('return empty array if there is no run with status', async () => {
        const bundle = {
            authData: {
                access_token: TEST_USER_TOKEN,
            },
            inputData: {
                taskId: testTaskId,
                status: ACTOR_JOB_STATUSES.TIMING_OUT,
            },
        };

        let scope;
        if (!TEST_USER_TOKEN) {
            scope = nock('https://api.apify.com')
                .get(`/v2/actor-tasks/${testTaskId}/runs/last`)
                .query({ status: ACTOR_JOB_STATUSES.TIMING_OUT })
                .reply(404, 'Run not found');
        }

        const testResult = await appTester(App.searches.searchTaskRun.operation.perform, bundle);

        expect(testResult.length).to.be.eql(0);
        scope?.done();
    });
});
