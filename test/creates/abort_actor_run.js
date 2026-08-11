/* eslint-env mocha */
const zapier = require('zapier-platform-core');
const chai = require('chai');
const { expect } = require('chai');
const chaiAsPromised = require('chai-as-promised');
const nock = require('nock');
const { ACTOR_JOB_STATUSES } = require('@apify/consts');
const { apifyClient, TEST_USER_TOKEN, createAndBuildActor, getMockRun, mockDatasetPublicUrl } = require('../helpers');

const App = require('../../index');
const { ABORT_ACTOR_RUN_SAMPLE, KEY_VALUE_STORE_SAMPLE, OMIT_ACTOR_RUN_FIELDS } = require('../../src/consts');

const appTester = zapier.createAppTester(App);

chai.use(chaiAsPromised);

// A graceful abort ends in ABORTING first, an immediate one in ABORTED - both are valid outcomes live.
const ABORT_STATUSES = [ACTOR_JOB_STATUSES.ABORTED, ACTOR_JOB_STATUSES.ABORTING];

/**
 * Mocks the calls enrichActorRun() makes on top of the abort response: the OUTPUT record,
 * the dataset size guard, the dataset items themselves and the dataset public URL.
 */
const mockRunEnrichment = (scope, run) => {
    scope.get(`/v2/key-value-stores/${run.defaultKeyValueStoreId}/records/OUTPUT`)
        .reply(200, KEY_VALUE_STORE_SAMPLE);
    scope.get(`/v2/datasets/${run.defaultDatasetId}/items`)
        .query({ limit: 1, clean: true })
        .reply(200, [{ foo: 'bar' }]);
    scope.get(`/v2/datasets/${run.defaultDatasetId}/items`)
        .query({ limit: 100, clean: true })
        .reply(200, [{ foo: 'bar' }]);
    scope.get(`/v2/datasets/${run.defaultDatasetId}`)
        .reply(200, mockDatasetPublicUrl(run.defaultDatasetId));
};

describe('create abort actor run', () => {
    let testActorId = 'test_actor-id';
    let testFinishedRunId = 'test_finished_run-id';

    before(async function () {
        if (TEST_USER_TOKEN) {
            this.timeout(240000); // We need time to build and run actor
            const actor = await createAndBuildActor();
            testActorId = actor.id;
            // A finished run, used to exercise the dynamic output fields.
            const finishedRun = await apifyClient.actor(testActorId).call({ waitSecs: 120 });
            testFinishedRunId = finishedRun.id;
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

    it('aborts a run', async () => {
        let expectedRunId;
        let scope;
        if (!TEST_USER_TOKEN) {
            const abortedRun = getMockRun({ status: ACTOR_JOB_STATUSES.ABORTED, exitCode: null });
            expectedRunId = abortedRun.id;

            scope = nock('https://api.apify.com');
            // NOTE: No query string is expected here - gracefully is omitted when it is not set.
            scope.post(`/v2/actor-runs/${expectedRunId}/abort`)
                .reply(200, { data: abortedRun });
            mockRunEnrichment(scope, abortedRun);
        } else {
            const startedRun = await apifyClient.actor(testActorId).start();
            expectedRunId = startedRun.id;
        }

        const bundle = {
            authData: {
                access_token: TEST_USER_TOKEN,
            },
            inputData: {
                runId: expectedRunId,
            },
        };

        const testResult = await appTester(App.creates.abortActorRun.operation.perform, bundle);

        expect(testResult.id).to.be.eql(expectedRunId);
        expect(ABORT_STATUSES).to.include(testResult.status);
        expect(testResult).to.include.all.keys('id', 'actId', 'status', 'detailsPageUrl', 'datasetItems', 'datasetItemsFileUrls');
        expect(testResult).to.not.have.any.keys(...OMIT_ACTOR_RUN_FIELDS);

        if (!TEST_USER_TOKEN) {
            expect(testResult.status).to.be.eql(ACTOR_JOB_STATUSES.ABORTED);
            expect(testResult).to.include.all.keys(Object.keys(ABORT_ACTOR_RUN_SAMPLE));
        }

        scope?.done();
    }).timeout(240000);

    it('aborts a run gracefully', async () => {
        let expectedRunId;
        let scope;
        if (!TEST_USER_TOKEN) {
            const abortingRun = getMockRun({ status: ACTOR_JOB_STATUSES.ABORTING, exitCode: null });
            expectedRunId = abortingRun.id;

            scope = nock('https://api.apify.com');
            scope.post(`/v2/actor-runs/${expectedRunId}/abort`)
                .query({ gracefully: 'true' })
                .reply(200, { data: abortingRun });
            mockRunEnrichment(scope, abortingRun);
        } else {
            const startedRun = await apifyClient.actor(testActorId).start();
            expectedRunId = startedRun.id;
        }

        const bundle = {
            authData: {
                access_token: TEST_USER_TOKEN,
            },
            inputData: {
                runId: expectedRunId,
                gracefully: true,
            },
        };

        const testResult = await appTester(App.creates.abortActorRun.operation.perform, bundle);

        expect(testResult.id).to.be.eql(expectedRunId);
        expect(ABORT_STATUSES).to.include(testResult.status);

        if (!TEST_USER_TOKEN) {
            expect(testResult.status).to.be.eql(ACTOR_JOB_STATUSES.ABORTING);
        }

        scope?.done();
    }).timeout(240000);

    it('returns the run unchanged when it already finished', async () => {
        let expectedRunId;
        let scope;
        if (!TEST_USER_TOKEN) {
            const finishedRun = getMockRun({ status: ACTOR_JOB_STATUSES.SUCCEEDED });
            expectedRunId = finishedRun.id;

            scope = nock('https://api.apify.com');
            scope.post(`/v2/actor-runs/${expectedRunId}/abort`)
                .reply(200, { data: finishedRun });
            mockRunEnrichment(scope, finishedRun);
        } else {
            expectedRunId = testFinishedRunId;
        }

        const bundle = {
            authData: {
                access_token: TEST_USER_TOKEN,
            },
            inputData: {
                runId: expectedRunId,
            },
        };

        const testResult = await appTester(App.creates.abortActorRun.operation.perform, bundle);

        expect(testResult.id).to.be.eql(expectedRunId);
        expect(testResult.status).to.be.eql(ACTOR_JOB_STATUSES.SUCCEEDED);

        scope?.done();
    }).timeout(240000);

    it('throws when the run does not exist', async () => {
        let scope;
        if (!TEST_USER_TOKEN) {
            scope = nock('https://api.apify.com');
            scope.post('/v2/actor-runs/non-existing-run-id/abort')
                .reply(404, {
                    error: {
                        type: 'record-not-found',
                        message: 'Run was not found',
                    },
                });
        }

        const bundle = {
            authData: {
                access_token: TEST_USER_TOKEN,
            },
            inputData: {
                runId: 'non-existing-run-id',
            },
        };

        // A create cannot signal a miss with [] the way a search does, so the error must surface.
        await expect(appTester(App.creates.abortActorRun.operation.perform, bundle)).to.be.rejected;

        scope?.done();
    }).timeout(240000);

    it('derives dynamic dataset output fields from the run ID', async () => {
        const bundle = {
            authData: {
                access_token: TEST_USER_TOKEN,
            },
            inputData: {
                runId: testFinishedRunId,
            },
        };

        let scope;
        if (!TEST_USER_TOKEN) {
            const actorRun = getMockRun({ id: testFinishedRunId, status: ACTOR_JOB_STATUSES.SUCCEEDED });
            scope = nock('https://api.apify.com');
            // The output-fields function resolves the run first to find its default dataset.
            scope.get(`/v2/actor-runs/${testFinishedRunId}`)
                .reply(200, {
                    data: actorRun,
                });
            scope.get(`/v2/datasets/${actorRun.defaultDatasetId}/items`)
                .query({ limit: 10, clean: true })
                .reply(200, [{ myField: 'value' }]);
            scope.get(`/v2/datasets/${actorRun.defaultDatasetId}`)
                .reply(200, mockDatasetPublicUrl(actorRun.defaultDatasetId));
        }

        // The dynamic output fields function is the last entry in the outputFields array.
        const { outputFields } = App.creates.abortActorRun.operation;
        const getDynamicOutputFields = outputFields[outputFields.length - 1];
        const fields = await appTester(getDynamicOutputFields, bundle);

        expect(fields).to.be.an('array');
        expect(fields.some((field) => field.key.startsWith('datasetItems[]'))).to.be.eql(true);

        scope?.done();
    }).timeout(240000);
});
