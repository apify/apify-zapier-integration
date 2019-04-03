const zapier = require('zapier-platform-core');
const { expect } = require('chai');
const { randomString, apifyClient, createWebScraperTask } = require('./helpers');

const App = require('../index');

const appTester = zapier.createAppTester(App);

// Injects all secrets from .env file
zapier.tools.env.inject();

describe('triggers', () => {

    describe('task run finished trigger', () => {
        let testTaskId;
        let subscribeData;

        before(async () => {
            // Create task for testing
            const task = await createWebScraperTask();
            testTaskId = task.id;
        });

        it('subscribe webhook work', async () => {
            const requestUrl = `http://example.com/#${randomString()}`;
            const bundle = {
                targetUrl: requestUrl,
                authData: {
                    token: process.env.TEST_USER_TOKEN,
                },
                inputData: {
                    taskId: testTaskId,
                },
                meta: {},
            };
            subscribeData = await appTester(App.triggers.taskRunFinished.operation.performSubscribe, bundle);

            // Check if webhook is set
            const taskWebhooks = await apifyClient.tasks.listWebhooks({
                taskId: testTaskId,
            });

            expect(taskWebhooks.items.length).to.be.eql(1);
            expect(taskWebhooks.items[0].requestUrl).to.be.eql(requestUrl);
        });

        it('unsubscribe webhook work', async () => {
            const bundle = {
                authData: {
                    token: process.env.TEST_USER_TOKEN,
                },
                subscribeData,
                meta: {},
            };
            await appTester(App.triggers.taskRunFinished.operation.performUnsubscribe, bundle);

            // Check if webhook is not set
            const taskWebhooks = await apifyClient.tasks.listWebhooks({
                taskId: testTaskId,
            });

            expect(taskWebhooks.items.length).to.be.eql(0);
        });

        it('perform should return task run detail', async () => {
            const runId = randomString();
            const bundle = {
                authData: {
                    token: process.env.TEST_USER_TOKEN,
                },
                inputData: {
                    taskId: testTaskId,
                },
                cleanedRequest: { // Mock webhook payload
                    resource: {
                        id: runId,
                    },
                },
            };

            const results = await appTester(App.triggers.taskRunFinished.operation.perform, bundle);

            expect(results.length).to.be.eql(1);
            expect(results[0].id).to.be.eql(bundle.cleanedRequest.resource.id);
        });

        it('performList should return task runs', async () => {
            // Create on task run
            const taskRun = await apifyClient.tasks.runTask({
                taskId: testTaskId,
                waitForFinish: 120,
            });

            const bundle = {
                authData: {
                    token: process.env.TEST_USER_TOKEN,
                },
                inputData: {
                    taskId: testTaskId,
                },
            };

            const results = await appTester(App.triggers.taskRunFinished.operation.performList, bundle);

            expect(results.length).to.be.eql(1);
            expect(results[0].id).to.be.eql(taskRun.id);
            expect(results[0].OUTPUT).to.not.equal(null);
            expect(results[0].INPUT).to.not.equal(null);
            expect(results[0].datasetItems.length).to.be.at.least(1);

        }).timeout(120000);

        after(async () => {
            await apifyClient.tasks.deleteTask({ taskId: testTaskId });
        });
    });

    describe('tasks hidden trigger', () => {

        it('work', async () => {
            const bundle = {
                authData: {
                    token: process.env.TEST_USER_TOKEN,
                },
                inputData: {},
                meta: {},
            };

            const taskList = await appTester(App.triggers.tasks.operation.perform, bundle);

            expect(taskList.length).to.be.at.least(1);
            taskList.forEach((task) => expect(task).to.have.all.keys(['id', 'name']));
        });
    });
});
