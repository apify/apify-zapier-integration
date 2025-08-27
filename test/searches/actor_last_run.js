/* eslint-env mocha */
const zapier = require('zapier-platform-core');
const { ACTOR_JOB_STATUSES } = require('@apify/consts');
const { expect } = require('chai');
const nock = require('nock');
const { apifyClient, TEST_USER_TOKEN, createAndBuildActor, getMockRun, mockDatasetPublicUrl } = require('../helpers');

const App = require('../../index');
const { KEY_VALUE_STORE_SAMPLE } = require('../../src/consts');

const appTester = zapier.createAppTester(App);

describe('search actor last run', () => {
    let testActorId = 'test_actor-id';

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

    it('work for actor without run', async () => {
        const bundle = {
            authData: {
                access_token: TEST_USER_TOKEN,
            },
            inputData: {
                actorId: testActorId,
                status: ACTOR_JOB_STATUSES.SUCCEEDED,
            },
        };

        let scope;
        if (!TEST_USER_TOKEN) {
            scope = nock('https://api.apify.com')
                .get(`/v2/acts/${testActorId}/runs/last`)
                .query({ status: ACTOR_JOB_STATUSES.SUCCEEDED })
                .reply(404, {
                    error: {
                        type: 'not-found',
                        message: 'Run not found',
                    },
                });
        }

        const testResult = await appTester(App.searches.searchActorRun.operation.perform, bundle);

        expect(testResult.length).to.be.eql(0);

        scope?.done();
    });

    it('work', async () => {
        const bundle = {
            authData: {
                access_token: TEST_USER_TOKEN,
            },
            inputData: {
                actorId: testActorId,
                status: ACTOR_JOB_STATUSES.SUCCEEDED,
            },
        };

        let actorRun;
        let scope;
        if (!TEST_USER_TOKEN) {
            actorRun = getMockRun();
            scope = nock('https://api.apify.com');
            scope.get(`/v2/acts/${testActorId}/runs/last`)
                .query({ status: ACTOR_JOB_STATUSES.SUCCEEDED })
                .reply(200, {
                    data: actorRun,
                });

            scope.get(`/v2/key-value-stores/${actorRun.defaultKeyValueStoreId}/records/OUTPUT`)
                .reply(200, KEY_VALUE_STORE_SAMPLE);

            scope.get(`/v2/datasets/${actorRun.defaultDatasetId}/items`)
                .query({ limit: 100, clean: true })
                .reply(200, [{ foo: 'bar' }]);
            scope.get(`/v2/datasets/${actorRun.defaultDatasetId}`)
                .reply(200, mockDatasetPublicUrl(actorRun.defaultDatasetId));
        } else {
            actorRun = await apifyClient.actor(testActorId).call({ waitSecs: 120 });
        }

        const testResult = await appTester(App.searches.searchActorRun.operation.perform, bundle);

        expect(testResult[0].status).to.be.eql(ACTOR_JOB_STATUSES.SUCCEEDED);
        expect(testResult[0].id).to.be.eql(actorRun.id);

        scope?.done();
    }).timeout(240000);
});
