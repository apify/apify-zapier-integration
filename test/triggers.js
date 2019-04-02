const zapier = require('zapier-platform-core');
const { expect } = require('chai');
const ApifyClient = require('apify-client');

const App = require('../index');

const appTester = zapier.createAppTester(App);

// Injects all secrets from .env file
zapier.tools.env.inject();

const apifyClient = new ApifyClient({ token: process.env.TEST_USER_TOKEN });

const randomString = () => Math.random().toString(32).split('.')[1];

describe('triggers', () => {
    describe('task run finished trigger', () => {
        let testTaskId;
        let subscribeData;
        before(async () => {
            // Create task for testing
            const task = await apifyClient.tasks.createTask({
                task: {
                    actId: 'apify/web-scraper',
                    name: `zapier-test-${randomString()}`,
                },
            });
            console.log(`Testing task id ${task.id} created`);
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
        it('should attach output and dataset items', async () => {
            // TODO
            // const bundle = {
            //     inputData: {
            //         style: 'mediterranean'
            //     },
            //     cleanedRequest: {
            //         id: 1,
            //         name: 'name 1',
            //         directions: 'directions 1'
            //     }
            // };
            //
            // const results = await appTester(App.triggers.recipe.operation.perform, bundle);
            //
            //
            //
            // expect(results.length).to.be.eql(1);

        });
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
