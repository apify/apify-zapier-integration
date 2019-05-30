const zapier = require('zapier-platform-core');
const { expect } = require('chai');
const { randomString, apifyClient, createWebScraperTask,
    TEST_USER_TOKEN, createLegacyCrawlerTask } = require('../helpers');
const { TASK_RUN_SAMPLE } = require('../../src/consts');

const App = require('../../index');

const appTester = zapier.createAppTester(App);


describe('task run finished trigger', () => {
    const testedResult = { testedField: 'testValue', url: 'https://apify.com' };
    let testTaskId;
    let legacyCrawlerTaskId;
    let subscribeData;

    before(async function () {
        this.timeout(120000);
        // Create task for testing
        const task = await createWebScraperTask();
        testTaskId = task.id;
        const legacyCrawlerTask = await createLegacyCrawlerTask(`function pageFunction(context) { return ${JSON.stringify(testedResult)} }`);
        legacyCrawlerTaskId = legacyCrawlerTask.id;
    });

    it('subscribe webhook work', async () => {
        const requestUrl = `http://example.com/#${randomString()}`;
        const bundle = {
            targetUrl: requestUrl,
            authData: {
                token: TEST_USER_TOKEN,
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
        expect(taskWebhooks.items[0].eventTypes)
            .to.include.members(['ACTOR.RUN.SUCCEEDED', 'ACTOR.RUN.FAILED','ACTOR.RUN.TIMED_OUT', 'ACTOR.RUN.ABORTED'])
            .but.not.include.members(['ACTOR.RUN.CREATED']);

    });

    it('unsubscribe webhook work', async () => {
        const bundle = {
            authData: {
                token: TEST_USER_TOKEN,
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
                token: TEST_USER_TOKEN,
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
                token: TEST_USER_TOKEN,
            },
            inputData: {
                taskId: testTaskId,
            },
        };

        const results = await appTester(App.triggers.taskRunFinished.operation.performList, bundle);

        expect(results.length).to.be.eql(1);
        expect(results[0].id).to.be.eql(taskRun.id);
        expect(results[0]).to.have.all.keys(Object.keys(TASK_RUN_SAMPLE));
        expect(results[0].OUTPUT).to.not.equal(null);
        expect(results[0].datasetItems.length).to.be.at.least(1);
        expect(results[0].datasetItemsFileUrls).to.include.all.keys('xml', 'csv', 'json', 'xlsx');
    }).timeout(120000);

    it('performList should return task runs (legacy crawler)', async () => {
        // Create on task run
        const taskRun = await apifyClient.tasks.runTask({
            taskId: legacyCrawlerTaskId,
            waitForFinish: 120,
        });

        const bundle = {
            authData: {
                token: TEST_USER_TOKEN,
            },
            inputData: {
                taskId: legacyCrawlerTaskId,
            },
        };

        const results = await appTester(App.triggers.taskRunFinished.operation.performList, bundle);

        expect(results.length).to.be.eql(1);
        expect(results[0].id).to.be.eql(taskRun.id);
        expect(results[0]).to.have.all.keys(Object.keys(TASK_RUN_SAMPLE));
        expect(results[0].datasetItems.length).to.be.at.least(1);
        expect(results[0].datasetItems[0]).to.be.eql(testedResult);
        expect(results[0].datasetItemsFileUrls).to.include.all.keys('xml', 'csv', 'json', 'xlsx');
    }).timeout(120000);

    after(async () => {
        await apifyClient.tasks.deleteTask({ taskId: testTaskId });
        await apifyClient.tasks.deleteTask({ taskId: legacyCrawlerTaskId });
    });
});

describe('tasks hidden trigger', () => {
    it('work', async () => {
        const bundle = {
            authData: {
                token: TEST_USER_TOKEN,
            },
            inputData: {},
            meta: {},
        };

        const taskList = await appTester(App.triggers.tasks.operation.perform, bundle);

        expect(taskList.length).to.be.at.least(1);
        taskList.forEach((task) => expect(task).to.have.all.keys(Object.keys(TASK_RUN_SAMPLE)));
    });
});
