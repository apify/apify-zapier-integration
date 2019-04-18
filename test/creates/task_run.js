const zapier = require('zapier-platform-core');
const { expect } = require('chai');
const { TEST_USER_TOKEN, apifyClient, createWebScraperTask, createLegacyCrawlerTask } = require('../helpers');

const App = require('../../index');

const appTester = zapier.createAppTester(App);

describe('create task run', () => {
    let testTask1Id;
    let testTask2Id;
    let testTask3Id;

    before(async () => {
        // Create task for testing
        const task1 = await createWebScraperTask();
        testTask1Id = task1.id;
        const task2 = await createWebScraperTask('() => ({ foo: "bar" })');
        testTask2Id = task2.id;
        const task3 = await createLegacyCrawlerTask('function pageFunction(context) { return { testedField: "testValue" } }');
        testTask3Id = task3.id;
    });

    it('runSync work', async () => {
        const urlToScrape = 'http://example.com';
        const bundle = {
            authData: {
                token: TEST_USER_TOKEN,
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

        const testResult = await appTester(App.creates.createTaskRun.operation.perform, bundle);

        expect(testResult.status).to.be.eql('SUCCEEDED');
        expect(testResult.OUTPUT).to.not.equal(null);
        expect(testResult.datasetItems.length).to.be.at.least(1);
        expect(testResult.datasetItems[0].url).be.eql(urlToScrape);
        expect(testResult.finishedAt).to.not.equal(null);
    }).timeout(120000);

    it('runSync work without output', async () => {
        const bundle = {
            authData: {
                token: TEST_USER_TOKEN,
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
                token: TEST_USER_TOKEN,
            },
            inputData: {
                taskId: testTask1Id,
                runSync: false,
            },
        };

        const testResult = await appTester(App.creates.createTaskRun.operation.perform, bundle);
        expect(testResult.finishedAt).to.be.eql(null);
    });

    it('run legacy crawler and return simplified items work', async () => {
        const bundle = {
            authData: {
                token: TEST_USER_TOKEN,
            },
            inputData: {
                taskId: testTask3Id,
                runSync: true,
            },
        };

        const testResult = await appTester(App.creates.createTaskRun.operation.perform, bundle);
        expect(testResult.datasetItems[0].testedField).be.eql('testValue');
    }).timeout(240000);

    after(async () => {
        await apifyClient.tasks.deleteTask({ taskId: testTask1Id });
        await apifyClient.tasks.deleteTask({ taskId: testTask2Id });
        await apifyClient.tasks.deleteTask({ taskId: testTask3Id });
    });
});
