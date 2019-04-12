const zapier = require('zapier-platform-core');
const { expect } = require('chai');
const { apifyClient, createWebScraperTask } = require('./helpers');

const App = require('../index');

const appTester = zapier.createAppTester(App);

// Injects all secrets from .env file
zapier.tools.env.inject();

describe('creates', () => {

    describe('create task run', () => {
        let testTaskId;

        before(async () => {
            // Create task for testing
            const task = await createWebScraperTask();
            testTaskId = task.id;
        });

        it('runSync work', async () => {
            const bundle = {
                authData: {
                    token: process.env.TEST_USER_TOKEN,
                },
                inputData: {
                    taskId: testTaskId,
                    runSync: true,
                },
            };

            const testResult = await appTester(App.creates.createTaskRun.operation.perform, bundle);

            expect(testResult.status).to.be.eql('SUCCEEDED');
            expect(testResult.OUTPUT).to.not.equal(null);
            expect(testResult.datasetItems.length).to.be.at.least(1);
            expect(testResult.finishedAt).to.not.equal(null);
        }).timeout(120000);

        it('runAsync work', async () => {
            const bundle = {
                authData: {
                    token: process.env.TEST_USER_TOKEN,
                },
                inputData: {
                    taskId: testTaskId,
                    runSync: false,
                },
            };

            const testResult = await appTester(App.creates.createTaskRun.operation.perform, bundle);
            expect(testResult.finishedAt).to.be.eql(null);
        });

        after(async () => {
            await apifyClient.tasks.deleteTask({ taskId: testTaskId });
        });
    });
});
