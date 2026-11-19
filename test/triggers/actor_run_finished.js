/* eslint-env mocha */
const zapier = require('zapier-platform-core');
const { expect } = require('chai');
const nock = require('nock');
const { WEBHOOK_EVENT_TYPE_GROUPS, ACTOR_JOB_TERMINAL_STATUSES } = require('@apify/consts');

const _ = require('lodash');
const { ActorListSortBy } = require('apify-client');
const { createAndBuildActor,
    apifyClient,
    TEST_USER_TOKEN,
    randomString,
    randomApifyId,
    getMockRun,
    getMockWebhookResponse,
    mockDatasetPublicUrl,
    waitForWebhookCount,
} = require('../helpers');
const { ACTOR_RUN_SAMPLE } = require('../../src/consts');

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
            // Check if webhook is set. The live API is eventually consistent, so poll until the created
            // webhook propagates instead of asserting on a single immediate read (which flakes with 0).
            const actorWebhooks = await waitForWebhookCount(apifyClient.actor(testActorId).webhooks(), 1);

            expect(actorWebhooks.items.length).to.be.eql(1);
            expect(actorWebhooks.items[0].requestUrl).to.be.eql(requestUrl);
            expect(actorWebhooks.items[0].eventTypes)
                .to.include.members(['ACTOR.RUN.SUCCEEDED', 'ACTOR.RUN.FAILED', 'ACTOR.RUN.TIMED_OUT', 'ACTOR.RUN.ABORTED'])
                .but.not.include.members(['ACTOR.RUN.CREATED']);
        } else {
            scope.done();
        }
    }).timeout(120000);

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
            const actorWebhooks = await waitForWebhookCount(apifyClient.actor(testActorId).webhooks(), 0);

            expect(actorWebhooks.items.length).to.be.eql(0);
        } else {
            scope.done();
        }
    });

    it('perform should return actor run detail', async () => {
        let run;
        let scope;
        if (TEST_USER_TOKEN) {
            run = await apifyClient.actor(testActorId).call({ waitSecs: 120 });
        } else {
            // No storages, so the run needs no further mocks.
            run = { id: randomString(), actId: testActorId, status: 'SUCCEEDED' };
            scope = nock('https://api.apify.com')
                .get(`/v2/actor-runs/${run.id}`)
                .reply(200, { data: run });
        }

        const bundle = {
            authData: {
                access_token: TEST_USER_TOKEN,
            },
            inputData: {
                actorId: testActorId,
            },
            cleanedRequest: { // Mock webhook payload
                resource: {
                    id: run.id,
                },
            },
        };

        const results = await appTester(App.triggers.actorRunFinished.operation.perform, bundle);

        expect(results.length).to.be.eql(1);
        expect(results[0].id).to.be.eql(run.id);
        scope?.done();
    }).timeout(240000);

    it('perform reads the run from the API, not from the hook request', async function () {
        if (TEST_USER_TOKEN) this.skip();

        const actorId = randomApifyId();
        const run = { id: randomString(), actId: actorId, status: 'SUCCEEDED' };
        const scope = nock('https://api.apify.com')
            .get(`/v2/actor-runs/${run.id}`)
            .reply(200, { data: run });

        const results = await appTester(App.triggers.actorRunFinished.operation.perform, {
            authData: { access_token: TEST_USER_TOKEN },
            inputData: { actorId },
            cleanedRequest: {
                resource: {
                    id: run.id,
                    status: 'FAILED',
                    defaultDatasetId: randomString(),
                    defaultKeyValueStoreId: randomString(),
                },
            },
        });

        // Nock fails the test on a request for the storages named in the hook request.
        expect(results.length).to.be.eql(1);
        expect(results[0].status).to.be.eql('SUCCEEDED');
        expect(results[0]).to.not.have.any.keys('defaultDatasetId', 'defaultKeyValueStoreId', 'datasetItems');
        scope.done();
    });

    it('perform skips a run of another Actor', async function () {
        if (TEST_USER_TOKEN) this.skip();

        const run = { id: randomString(), actId: randomApifyId(), status: 'SUCCEEDED' };
        const scope = nock('https://api.apify.com')
            .get(`/v2/actor-runs/${run.id}`)
            .reply(200, { data: run });

        const results = await appTester(App.triggers.actorRunFinished.operation.perform, {
            authData: { access_token: TEST_USER_TOKEN },
            inputData: { actorId: randomApifyId() },
            cleanedRequest: { resource: { id: run.id } },
        });

        expect(results).to.be.eql([]);
        scope.done();
    });

    it('perform skips a run that does not exist', async function () {
        if (TEST_USER_TOKEN) this.skip();

        const runId = randomString();
        const scope = nock('https://api.apify.com')
            .get(`/v2/actor-runs/${runId}`)
            .reply(404, { error: { type: 'record-not-found', message: 'Actor run was not found' } });

        const results = await appTester(App.triggers.actorRunFinished.operation.perform, {
            authData: { access_token: TEST_USER_TOKEN },
            inputData: { actorId: randomApifyId() },
            cleanedRequest: { resource: { id: runId } },
        });

        expect(results).to.be.eql([]);
        scope.done();
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

            runs.forEach((run) => { delete run.integrationTracking; });

            scope = nock('https://api.apify.com');
            scope.get(`/v2/acts/${testActorId}/runs`)
                .query({ limit: 100, desc: true, status: ACTOR_JOB_TERMINAL_STATUSES.join(',') })
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
                    .reply(200, { foo: 'bar' });

                scope.get(`/v2/datasets/${run.defaultDatasetId}/items`)
                    .query({ limit: 1, clean: true })
                    .reply(200, [{ foo: 'bar' }]);

                scope.get(`/v2/datasets/${run.defaultDatasetId}/items`)
                    .query({ limit: 100, clean: true })
                    .reply(200, [{ foo: 'bar' }]);

                scope.get(`/v2/datasets/${run.defaultDatasetId}`)
                    .reply(200, mockDatasetPublicUrl(run.defaultDatasetId));
            });
        }

        const results = await appTester(App.triggers.actorRunFinished.operation.performList, bundle);

        expect(results.length).to.be.eql(3);
        expect(results.every((item) => runs.some((run) => run.id === item.id))).to.eql(true);
        expect(results[0]).to.have.all.keys(_.omit({ ...ACTOR_RUN_SAMPLE, consoleUrl: '' }, 'integrationTracking'));
        expect(results[0].OUTPUT).to.not.equal(null);
        expect(results[0].datasetItems.length).to.be.at.least(1);
        expect(results[0].datasetItemsFileUrls).to.include.all.keys('xml', 'csv', 'json', 'xlsx');

        scope?.done();
    }).timeout(240000);

    describe('actors hidden trigger', () => {
        afterEach(async () => {
            if (!TEST_USER_TOKEN) {
                nock.cleanAll();
            }
        });

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
                    .query({ limit: 500, offset: 0, sortBy: ActorListSortBy.LAST_RUN_STARTED_AT, desc: 1 })
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
        }).timeout(30_000);
    });
});
