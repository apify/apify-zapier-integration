const zapier = require('zapier-platform-core');
const { expect } = require('chai');
const { createAndBuildActor, apifyClient, TEST_USER_TOKEN, randomString } = require('../helpers');
const App = require('../../index');

const appTester = zapier.createAppTester(App);

describe('actor run finished trigger', (suite) => {
    let testActorId;
    let subscribeData;

    before(async function () {
        this.timeout(120000); // We need time to build actor
        // Create actor for testing
        const actor = await createAndBuildActor();
        testActorId = actor.id;
    });

    it('subscribe webhook work', async () => {
        const requestUrl = `http://example.com/#${randomString()}`;
        const bundle = {
            targetUrl: requestUrl,
            authData: {
                token: TEST_USER_TOKEN,
            },
            inputData: {
                actorId: testActorId,
            },
            meta: {},
        };
        subscribeData = await appTester(App.triggers.actorRunFinished.operation.performSubscribe, bundle);

        // Check if webhook is set
        const taskWebhooks = await apifyClient.acts.listWebhooks({
            actId: testActorId,
        });

        expect(taskWebhooks.items.length).to.be.eql(1);
        expect(taskWebhooks.items[0].requestUrl).to.be.eql(requestUrl);
    });

    it('unsubscribe webhook work', async () => {
        const bundle = {
            authData: {
                token: TEST_USER_TOKEN,
            },
            subscribeData,
            meta: {},
        };
        await appTester(App.triggers.actorRunFinished.operation.performUnsubscribe, bundle);

        // Check if webhook is not set
        const taskWebhooks = await apifyClient.acts.listWebhooks({
            actId: testActorId,
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
                actorId: testActorId,
            },
            cleanedRequest: { // Mock webhook payload
                resource: {
                    id: runId,
                },
            },
        };

        const results = await appTester(App.triggers.actorRunFinished.operation.perform, bundle);

        expect(results.length).to.be.eql(1);
        expect(results[0].id).to.be.eql(bundle.cleanedRequest.resource.id);
    });

    it('performList should return actor runs', async () => {
        const actorRun = await apifyClient.acts.runAct({
            actId: testActorId,
            waitForFinish: 120,
        });

        const bundle = {
            authData: {
                token: TEST_USER_TOKEN,
            },
            inputData: {
                actorId: testActorId,
            },
        };

        const results = await appTester(App.triggers.actorRunFinished.operation.performList, bundle);

        expect(results.length).to.be.eql(1);
        expect(results[0].id).to.be.eql(actorRun.id);
        expect(results[0].OUTPUT).to.not.equal(null);
        expect(results[0].datasetItems.length).to.be.at.least(1);
        expect(results[0].datasetItemsFileUrls).to.include.all.keys('xml', 'csv', 'json', 'xlsx');
    }).timeout(240000);

    after(async () => {
        await apifyClient.acts.deleteAct({ actId: testActorId });
    });
});

describe('actors hidden trigger', () => {
    it('work', async () => {
        const bundle = {
            authData: {
                token: TEST_USER_TOKEN,
            },
            inputData: {},
            meta: {},
        };

        const actorList = await appTester(App.triggers.tasks.operation.perform, bundle);

        expect(actorList.length).to.be.at.least(1);
        actorList.forEach((task) => expect(task).to.have.all.keys(['id', 'name']));
    });
});
