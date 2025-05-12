const zapier = require('zapier-platform-core');
const { expect } = require('chai');
const nock = require('nock');
const { WEBHOOK_EVENT_TYPE_GROUPS } = require('@apify/consts');

const { createAndBuildActor, apifyClient, TEST_USER_TOKEN, randomString, getMockRun, getMockWebhookResponse} = require('../helpers');
const { ACTOR_RUN_SAMPLE, KEY_VALUE_STORE_SAMPLE } = require('../../src/consts');

const App = require('../../index');

const appTester = zapier.createAppTester(App);

describe('actor run finished trigger', () => {
    let testActorId = randomString();
    let subscribeData;

    before(async function () {
        if (TEST_USER_TOKEN) {
            this.timeout(120000); // We need time to build actor
            // Create actor for testing
            const actor = await createAndBuildActor();
            testActorId = actor.id;
        }
    });

    after(async () => {
        if (TEST_USER_TOKEN) {
            await apifyClient.actor(testActorId).delete();
        }
    });

    afterEach(async () => {
        if (!TEST_USER_TOKEN) {
            nock.cleanAll();
        }
    });

    it('subscribe webhook work', async () => {
        const requestUrl = `http://example.com/#${randomString()}`;
        const bundle = {
            targetUrl: requestUrl,
            authData: {
                access_token: TEST_USER_TOKEN ?? 'test-token',
            },
            inputData: {
                actorId: testActorId,
            },
            meta: {},
        };

        let scope;

        if (!TEST_USER_TOKEN) {
            scope = nock('https://api.apify.com')
                .post('/v2/webhooks', (payload) => {
                    expect(payload).to.have.property('requestUrl', requestUrl);
                    expect(payload).to.have.property('eventTypes')
                        .that.includes.members(WEBHOOK_EVENT_TYPE_GROUPS.ACTOR_RUN_TERMINAL);
                    expect(payload).to.have.property('condition').that.has.property('actorId', testActorId);
                    return true;
                })
                .query(true)
                // Mock the response here as it is used in other tests. It's not ideal as we want to have our tests independent of each other,
                .reply(201, getMockWebhookResponse(testActorId, requestUrl));
        }

        subscribeData = await appTester(App.triggers.actorRunFinished.operation.performSubscribe, bundle);

        if (TEST_USER_TOKEN) {
            // Check if webhook is set
            const actorWebhooks = await apifyClient.actor(testActorId).webhooks().list();

            expect(actorWebhooks.items.length).to.be.eql(1);
            expect(actorWebhooks.items[0].requestUrl).to.be.eql(requestUrl);
            expect(actorWebhooks.items[0].eventTypes)
                .to.include.members(['ACTOR.RUN.SUCCEEDED', 'ACTOR.RUN.FAILED', 'ACTOR.RUN.TIMED_OUT', 'ACTOR.RUN.ABORTED'])
                .but.not.include.members(['ACTOR.RUN.CREATED']);
        } else {
            scope.done();
        }
    });

    it('unsubscribe webhook work', async () => {
        const bundle = {
            authData: {
                access_token: TEST_USER_TOKEN,
            },
            subscribeData,
            meta: {},
        };

        let scope;
        if (!TEST_USER_TOKEN) {
            scope = nock('https://api.apify.com')
                .delete(`/v2/webhooks/${subscribeData.id}`)
                .query(true)
                .reply(204);
        }

        await appTester(App.triggers.actorRunFinished.operation.performUnsubscribe, bundle);

        if (TEST_USER_TOKEN) {
            // Check if webhook is not set
            const actorWebhooks = await apifyClient.actor(testActorId).webhooks().list();

            expect(actorWebhooks.items.length).to.be.eql(0);
        } else {
            scope.done();
        }
    });

    it('perform should return actor run detail', async () => {
        const runId = randomString();
        const bundle = {
            authData: {
                access_token: TEST_USER_TOKEN,
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

        if (TEST_USER_TOKEN) {
            for (let i = 0; i < 4; i++) {
                const run = await apifyClient.actor(testActorId).call({
                    waitSecs: 120,
                });
                runs.push(run);
            }
        }

        const bundle = {
            authData: {
                access_token: TEST_USER_TOKEN,
            },
            inputData: {
                actorId: testActorId,
            },
        };

        let scope;
        if (!TEST_USER_TOKEN) {
            runs.push(getMockRun());
            runs.push(getMockRun());
            runs.push(getMockRun());
            runs.push(getMockRun());

            scope = nock('https://api.apify.com');
            scope.get(`/v2/acts/${testActorId}/runs`)
                .query({ limit: 100, desc: true })
                .reply(200, {
                    data: {
                        items: runs.map((run) => {
                            return { id: run.id, status: run.status };
                        }),
                    },
                });

            runs.slice(0, 3).forEach((run) => {
                scope.get(`/v2/acts/${testActorId}/runs/${run.id}`)
                    .query(true)
                    .reply(200, { data: run });

                scope.get(`/v2/key-value-stores/${run.defaultKeyValueStoreId}/records/OUTPUT`)
                    .reply(200, KEY_VALUE_STORE_SAMPLE);

                scope.get(`/v2/datasets/${run.defaultDatasetId}/items`)
                    .query({ limit: 100, clean: true })
                    .reply(200, [{ foo: 'bar' }]);
            });
        }

        const results = await appTester(App.triggers.actorRunFinished.operation.performList, bundle);

        expect(results.length).to.be.eql(3);
        expect(results.map((item) => item.id)).to.eql(runs.slice(0, 3).map((run) => run.id));
        expect(results[0]).to.have.all.keys({ ...ACTOR_RUN_SAMPLE, consoleUrl: '' });
        expect(results[0].OUTPUT).to.not.equal(null);
        expect(results[0].datasetItems.length).to.be.at.least(1);
        expect(results[0].datasetItemsFileUrls).to.include.all.keys('xml', 'csv', 'json', 'xlsx');

        scope?.done();
    }).timeout(240000);

    describe('actors hidden trigger', () => {
        it('work', async () => {
            const bundle = {
                authData: {
                    access_token: TEST_USER_TOKEN,
                },
                inputData: {},
                meta: {},
            };

            let scope;
            if (!TEST_USER_TOKEN) {
                scope = nock('https://api.apify.com')
                    .get('/v2/acts')
                    .query({ limit: 500, offset: 0 })
                    .reply(200, {
                        data: {
                            total: 1,
                            offset: 0,
                            limit: 500,
                            desc: false,
                            count: 1,
                            items: [{
                                id: testActorId,
                                name: 'test-actor-name',
                                username: 'test-user-id',
                                createdAt: new Date().toISOString(),
                                modifiedAt: new Date().toISOString(),
                            }],
                        },
                    });
            }

            const actorList = await appTester(App.triggers.actors.operation.perform, bundle);

            expect(actorList.length).to.be.at.least(1);
            actorList.forEach((actor) => expect(actor).to.have.all.keys('id', 'name'));

            scope?.done();
        });
    });
});
