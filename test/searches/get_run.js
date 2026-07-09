/* eslint-env mocha */
const zapier = require('zapier-platform-core');
const { ACTOR_JOB_STATUSES } = require('@apify/consts');
const { expect } = require('chai');
const nock = require('nock');
const { apifyClient, TEST_USER_TOKEN, createAndBuildActor, getMockRun, mockDatasetPublicUrl } = require('../helpers');

const App = require('../../index');
const { KEY_VALUE_STORE_SAMPLE } = require('../../src/consts');

const appTester = zapier.createAppTester(App);

describe('search get actor run by ID', () => {
    let testActorId = 'test_actor-id';
    let testRunId = 'test_run-id';

    before(async function () {
        if (TEST_USER_TOKEN) {
            this.timeout(240000); // We need time to build and run actor
            // Create and run actor for testing
            const actor = await createAndBuildActor();
            testActorId = actor.id;
            const run = await apifyClient.actor(testActorId).call({ waitSecs: 120 });
            testRunId = run.id;
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

    it('returns empty array when run not found', async () => {
        const bundle = {
            authData: {
                access_token: TEST_USER_TOKEN,
            },
            inputData: {
                runId: 'non-existing-run-id',
            },
        };

        let scope;
        if (!TEST_USER_TOKEN) {
            scope = nock('https://api.apify.com')
                .get('/v2/actor-runs/non-existing-run-id')
                .reply(404, {
                    error: {
                        type: 'record-not-found',
                        message: 'Run was not found',
                    },
                });
        }

        const testResult = await appTester(App.searches.getActorRunById.operation.perform, bundle);

        expect(testResult.length).to.be.eql(0);

        scope?.done();
    });

    it('work', async () => {
        const bundle = {
            authData: {
                access_token: TEST_USER_TOKEN,
            },
            inputData: {
                runId: testRunId,
            },
        };

        let actorRun;
        let scope;
        if (!TEST_USER_TOKEN) {
            actorRun = getMockRun({ id: testRunId, status: ACTOR_JOB_STATUSES.SUCCEEDED });
            scope = nock('https://api.apify.com');
            scope.get(`/v2/actor-runs/${testRunId}`)
                .reply(200, {
                    data: actorRun,
                });

            scope.get(`/v2/key-value-stores/${actorRun.defaultKeyValueStoreId}/records/OUTPUT`)
                .reply(200, KEY_VALUE_STORE_SAMPLE);

            scope.get(`/v2/datasets/${actorRun.defaultDatasetId}/items`)
                .query({ limit: 1, clean: true })
                .reply(200, [{ foo: 'bar' }]);
            scope.get(`/v2/datasets/${actorRun.defaultDatasetId}/items`)
                .query({ limit: 100, clean: true })
                .reply(200, [{ foo: 'bar' }]);
            scope.get(`/v2/datasets/${actorRun.defaultDatasetId}`)
                .reply(200, mockDatasetPublicUrl(actorRun.defaultDatasetId));
        } else {
            actorRun = { id: testRunId };
        }

        const testResult = await appTester(App.searches.getActorRunById.operation.perform, bundle);

        expect(testResult.length).to.be.eql(1);
        expect(testResult[0].id).to.be.eql(actorRun.id);

        scope?.done();
    }).timeout(240000);
});
