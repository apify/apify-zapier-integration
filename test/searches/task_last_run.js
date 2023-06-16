const zapier = require('zapier-platform-core');
const { ACTOR_JOB_STATUSES } = require('@apify/consts');
const { expect } = require('chai');
const { apifyClient, createWebScraperTask, TEST_USER_TOKEN } = require('../helpers');

const App = require('../../index');

const appTester = zapier.createAppTester(App);

describe('search task last run', () => {
    let testTaskId;

    before(async () => {
        // Create task for testing
        const task = await createWebScraperTask();
        testTaskId = task.id;
    });

    it('work for task without run', async () => {
        const bundle = {
            authData: {
                token: TEST_USER_TOKEN,
            },
            inputData: {
                taskId: testTaskId,
                status: ACTOR_JOB_STATUSES.SUCCEEDED,
            },
        };

        const testResult = await appTester(App.searches.searchTaskRun.operation.perform, bundle);

        expect(testResult.length).to.be.eql(0);
    }).timeout(240000);

    it('work', async () => {
        const bundle = {
            authData: {
                token: TEST_USER_TOKEN,
            },
            inputData: {
                taskId: testTaskId,
                status: ACTOR_JOB_STATUSES.SUCCEEDED,
            },
        };

        const taskRun = await apifyClient.task(testTaskId).call({
            waitSecs: 120,
        });

        const testResult = await appTester(App.searches.searchTaskRun.operation.perform, bundle);

        expect(testResult[0].status).to.be.eql(ACTOR_JOB_STATUSES.SUCCEEDED);
        expect(testResult[0].id).to.be.eql(taskRun.id);
    }).timeout(240000);


    it('return empty array if there is no run with status', async () => {
        const bundle = {
            authData: {
                token: TEST_USER_TOKEN,
            },
            inputData: {
                taskId: testTaskId,
                status: 'TIMING-OUT',
            },
        };

        const testResult = await appTester(App.searches.searchTaskRun.operation.perform, bundle);

        expect(testResult.length).to.be.eql(0);
    });

    after(async () => {
        await apifyClient.task(testTaskId).delete();
    });
});
