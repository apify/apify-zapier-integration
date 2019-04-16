const zapier = require('zapier-platform-core');
const { expect } = require('chai');
const { apifyClient, createWebScraperTask } = require('./helpers');

const App = require('../index');

const appTester = zapier.createAppTester(App);

// Injects all secrets from .env file
zapier.tools.env.inject();

describe('creates', () => {

    describe('create task run', () => {
        let testTask1Id;
        let testTask2Id;

        before(async () => {
            // Create task for testing
            const task1 = await createWebScraperTask();
            testTask1Id = task1.id;
            const task2 = await createWebScraperTask('() => ({ foo: "bar" })');
            testTask2Id = task2.id;
        });

        it('runSync work', async () => {
            const bundle = {
                authData: {
                    token: process.env.TEST_USER_TOKEN,
                },
                inputData: {
                    taskId: testTask1Id,
                    runSync: true,
                },
            };

            const testResult = await appTester(App.creates.createTaskRun.operation.perform, bundle);

            expect(testResult.status).to.be.eql('SUCCEEDED');
            expect(testResult.OUTPUT).to.not.equal(null);
            expect(testResult.datasetItems.length).to.be.at.least(1);
            expect(testResult.finishedAt).to.not.equal(null);
        }).timeout(120000);

        it('runSync work without output', async () => {
            const bundle = {
                authData: {
                    token: process.env.TEST_USER_TOKEN,
                },
                inputData: {
                    taskId: testTask2Id,
                    runSync: true,
                },
            };

            const testResult = await appTester(App.creates.createTaskRun.operation.perform, bundle);

            expect(testResult.status).to.be.eql('SUCCEEDED');
            expect(testResult.OUTPUT).to.not.equal(null);
            expect(testResult.OUTPUT).to.have.property('error');
            expect(testResult.finishedAt).to.not.equal(null);
        }).timeout(120000);

        it('runAsync work', async () => {
            const bundle = {
                authData: {
                    token: process.env.TEST_USER_TOKEN,
                },
                inputData: {
                    taskId: testTask1Id,
                    runSync: false,
                },
            };

            const testResult = await appTester(App.creates.createTaskRun.operation.perform, bundle);
            expect(testResult.finishedAt).to.be.eql(null);
        });

        after(async () => {
            await apifyClient.tasks.deleteTask({ taskId: testTask1Id });
            await apifyClient.tasks.deleteTask({ taskId: testTask2Id });
        });
    });
});
