const zapier = require('zapier-platform-core');
const { ACT_JOB_STATUSES } = require('apify-shared/consts');
const { expect } = require('chai');
const { apifyClient, createWebScraperTask } = require('./helpers');

const App = require('../index');

const appTester = zapier.createAppTester(App);

// Injects all secrets from .env file
zapier.tools.env.inject();

describe('searches', () => {

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
                    token: process.env.TEST_USER_TOKEN,
                },
                inputData: {
                    taskId: testTaskId,
                    status: ACT_JOB_STATUSES.SUCCEEDED,
                },
            };

            const testResult = await appTester(App.searches.searchTaskRun.operation.perform, bundle);

            expect(testResult.length).to.be.eql(0);
        }).timeout(240000);

        it('work', async () => {
            const bundle = {
                authData: {
                    token: process.env.TEST_USER_TOKEN,
                },
                inputData: {
                    taskId: testTaskId,
                    status: ACT_JOB_STATUSES.SUCCEEDED,
                },
            };

            const taskRun = await apifyClient.tasks.runTask({
                taskId: testTaskId,
                waitForFinish: 120,
            });

            const testResult = await appTester(App.searches.searchTaskRun.operation.perform, bundle);

            expect(testResult[0].status).to.be.eql(ACT_JOB_STATUSES.SUCCEEDED);
            expect(testResult[0].id).to.be.eql(taskRun.id);
        }).timeout(240000);

        after(async () => {
            await apifyClient.tasks.deleteTask({ taskId: testTaskId });
        });
    });
});
