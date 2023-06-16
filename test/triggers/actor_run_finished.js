const zapier = require('zapier-platform-core');
const { expect } = require('chai');
const { createAndBuildActor, apifyClient, TEST_USER_TOKEN, randomString } = require('../helpers');
const { ACTOR_RUN_SAMPLE } = require('../../src/consts');
const App = require('../../index');

const appTester = zapier.createAppTester(App);

describe('actor run finished trigger', () => {
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
        const actorWebhooks = await apifyClient.actor(testActorId).webhooks().list();

        expect(actorWebhooks.items.length).to.be.eql(1);
        expect(actorWebhooks.items[0].requestUrl).to.be.eql(requestUrl);
        expect(actorWebhooks.items[0].eventTypes)
            .to.include.members(['ACTOR.RUN.SUCCEEDED', 'ACTOR.RUN.FAILED', 'ACTOR.RUN.TIMED_OUT', 'ACTOR.RUN.ABORTED'])
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
        await appTester(App.triggers.actorRunFinished.operation.performUnsubscribe, bundle);

        // Check if webhook is not set
        const actorWebhooks = await apifyClient.actor(testActorId).webhooks().list();

        expect(actorWebhooks.items.length).to.be.eql(0);
    });

    it('perform should return actor run detail', async () => {
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
        const runs = [];
        for (let i = 0; i < 4; i++) {
            const run = await apifyClient.actor(testActorId).call({
                waitSecs: 120,
            });
            runs.push(run);
        }
        const bundle = {
            authData: {
                token: TEST_USER_TOKEN,
            },
            inputData: {
                actorId: testActorId,
            },
        };

        const results = await appTester(App.triggers.actorRunFinished.operation.performList, bundle);

        expect(results.length).to.be.eql(3);
        expect(results[0].id).to.be.eql(runs.pop().id);
        expect(results[0]).to.have.all.keys(Object.keys(ACTOR_RUN_SAMPLE));
        expect(results[0].OUTPUT).to.not.equal(null);
        expect(results[0].datasetItems.length).to.be.at.least(1);
        expect(results[0].datasetItemsFileUrls).to.include.all.keys('xml', 'csv', 'json', 'xlsx');
    }).timeout(240000);

    describe('actors hidden trigger', () => {
        it('work', async () => {
            const bundle = {
                authData: {
                    token: TEST_USER_TOKEN,
                },
                inputData: {},
                meta: {},
            };

            const actorList = await appTester(App.triggers.actors.operation.perform, bundle);

            expect(actorList.length).to.be.at.least(1);
            actorList.forEach((actor) => expect(actor).to.have.all.keys('id', 'name'));
        });
    });

    after(async () => {
        await apifyClient.actor(testActorId).delete();
    });
});
