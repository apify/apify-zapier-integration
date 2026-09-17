/* eslint-env mocha */
const { expect } = require('chai');
const zapier = require('zapier-platform-core');
const chai = require('chai');
const chaiAsPromised = require('chai-as-promised');
const nock = require('nock');
const { ACTOR_JOB_STATUSES, WEBHOOK_EVENT_TYPES } = require('@apify/consts');
const { TEST_USER_TOKEN, getMockRun, getMockActorDetails, mockDatasetPublicUrl, TEST_CALLBACK_URL,
    parseRunCallbackWebhookParam, performAndResume, randomString } = require('../helpers');
const App = require('../../index');
const { RUN_ACTOR_AND_FETCH_RESULTS_SAMPLE, RUN_ACTOR_AND_FETCH_RESULTS_DEFAULT_ITEMS_LIMIT,
    DEFAULT_SYNC_RUN_TIMEOUT_SECS } = require('../../src/consts');

const appTester = zapier.createAppTester(App);

chai.use(chaiAsPromised);

describe('run Actor and fetch results', () => {
    afterEach(async () => {
        nock.cleanAll();
    });

    it('runs an Actor, waits for it and returns dataset items inline (mocked)', async function () {
        if (TEST_USER_TOKEN) this.skip();

        const testActorId = randomString();
        const bundle = {
            authData: { access_token: randomString() },
            inputData: {
                actorId: testActorId,
                inputBody: '',
                build: 'latest',
                timeoutSecs: 120,
                memoryMbytes: 1024,
            },
        };

        const items = [{ foo: 'bar' }, { foo: 'baz' }];
        const run = getMockRun({ actId: testActorId });

        let webhooksParam;
        const scope = nock('https://api.apify.com');
        scope.post(`/v2/acts/${testActorId}/runs`)
            .query((query) => {
                webhooksParam = query.webhooks;
                return query.timeout === '120' && query.memory === '1024' && query.build === 'latest' && !!query.webhooks;
            })
            .reply(200, { data: run });
        scope.get(`/v2/actor-runs/${run.id}`)
            .reply(200, { data: run });
        // The size-guard sample fetch (limit 1) that precedes the real fetch below.
        scope.get(`/v2/datasets/${run.defaultDatasetId}/items`)
            .query({ limit: 1, clean: true })
            .reply(200, items.slice(0, 1));
        scope.get(`/v2/datasets/${run.defaultDatasetId}/items`)
            .query({ limit: RUN_ACTOR_AND_FETCH_RESULTS_DEFAULT_ITEMS_LIMIT, clean: true })
            .reply(200, items);
        scope.get(`/v2/datasets/${run.defaultDatasetId}`)
            .reply(200, mockDatasetPublicUrl(run.defaultDatasetId));

        const testResult = await performAndResume(appTester, App.creates.runActorAndFetchResults, bundle);

        expect(parseRunCallbackWebhookParam(webhooksParam)).to.be.eql([{
            eventTypes: [
                WEBHOOK_EVENT_TYPES.ACTOR_RUN_SUCCEEDED,
                WEBHOOK_EVENT_TYPES.ACTOR_RUN_FAILED,
                WEBHOOK_EVENT_TYPES.ACTOR_RUN_TIMED_OUT,
                WEBHOOK_EVENT_TYPES.ACTOR_RUN_ABORTED,
            ],
            requestUrl: TEST_CALLBACK_URL,
        }]);
        expect(testResult).to.have.all.keys(Object.keys(RUN_ACTOR_AND_FETCH_RESULTS_SAMPLE));
        expect(testResult.status).to.be.eql(ACTOR_JOB_STATUSES.SUCCEEDED);
        expect(testResult.items).to.be.eql(items);
        expect(testResult.detailsPageUrl).to.eql(`https://console.apify.com/actors/${run.actId}/runs/${run.id}`);

        scope.done();
    });

    it('applies the limit and fields inputs to the dataset items request', async function () {
        if (TEST_USER_TOKEN) this.skip();

        const testActorId = randomString();
        const bundle = {
            authData: { access_token: randomString() },
            inputData: {
                actorId: testActorId,
                inputBody: '',
                build: 'latest',
                timeoutSecs: 120,
                memoryMbytes: 1024,
                limit: 5,
                fields: ' title , url ',
            },
        };

        const items = [{ title: 't1', url: 'u1' }];
        const run = getMockRun({ actId: testActorId });

        const scope = nock('https://api.apify.com');
        scope.post(`/v2/acts/${testActorId}/runs`)
            .query((query) => !!query.webhooks)
            .reply(200, { data: run });
        scope.get(`/v2/actor-runs/${run.id}`)
            .reply(200, { data: run });
        // The size-guard sample fetch (limit 1) that precedes the real fetch below.
        scope.get(`/v2/datasets/${run.defaultDatasetId}/items`)
            .query({ limit: 1, fields: 'title,url', clean: true })
            .reply(200, items);
        scope.get(`/v2/datasets/${run.defaultDatasetId}/items`)
            .query({ limit: 5, fields: 'title,url', clean: true })
            .reply(200, items);
        scope.get(`/v2/datasets/${run.defaultDatasetId}`)
            .reply(200, mockDatasetPublicUrl(run.defaultDatasetId));

        const testResult = await performAndResume(appTester, App.creates.runActorAndFetchResults, bundle);

        expect(testResult.items).to.be.eql(items);

        scope.done();
    });

    it('respects an explicit limit of 0 instead of falling back to the default', async function () {
        if (TEST_USER_TOKEN) this.skip();

        const testActorId = randomString();
        const bundle = {
            authData: { access_token: randomString() },
            inputData: {
                actorId: testActorId,
                inputBody: '',
                build: 'latest',
                timeoutSecs: 120,
                memoryMbytes: 1024,
                limit: 0,
            },
        };

        const run = getMockRun({ actId: testActorId });

        const scope = nock('https://api.apify.com');
        scope.post(`/v2/acts/${testActorId}/runs`)
            .query((query) => !!query.webhooks)
            .reply(200, { data: run });
        scope.get(`/v2/actor-runs/${run.id}`)
            .reply(200, { data: run });
        // The size-guard sample fetch always uses limit 1 regardless of the requested limit.
        scope.get(`/v2/datasets/${run.defaultDatasetId}/items`)
            .query({ limit: 1, clean: true })
            .reply(200, [{ foo: 'bar' }]);
        scope.get(`/v2/datasets/${run.defaultDatasetId}/items`)
            .query({ limit: 0, clean: true })
            .reply(200, []);
        scope.get(`/v2/datasets/${run.defaultDatasetId}`)
            .reply(200, mockDatasetPublicUrl(run.defaultDatasetId));

        const testResult = await performAndResume(appTester, App.creates.runActorAndFetchResults, bundle);

        expect(testResult.items).to.be.eql([]);

        scope.done();
    });

    it('test step waits for the run results instead of using a callback', async function () {
        if (TEST_USER_TOKEN) this.skip();

        const testActorId = randomString();
        const bundle = {
            authData: { access_token: randomString() },
            inputData: {
                actorId: testActorId,
                inputBody: '',
                build: 'latest',
                timeoutSecs: 120,
                memoryMbytes: 1024,
            },
            meta: {
                isLoadingSample: true,
            },
        };

        const run = getMockRun({ actId: testActorId });
        const items = [{ foo: 'bar' }];

        const scope = nock('https://api.apify.com');
        scope.post(`/v2/acts/${testActorId}/runs`)
            // No callback webhook, the step is not paused in the editor.
            .query((query) => query.webhooks === undefined)
            .reply(200, { data: { ...run, status: ACTOR_JOB_STATUSES.RUNNING } });
        scope.get(`/v2/actor-runs/${run.id}`)
            .query((query) => !!query.waitForFinish)
            .reply(200, { data: run });
        // The size-guard sample fetch (limit 1) that precedes the real fetch below.
        scope.get(`/v2/datasets/${run.defaultDatasetId}/items`)
            .query({ limit: 1, clean: true })
            .reply(200, items);
        scope.get(`/v2/datasets/${run.defaultDatasetId}/items`)
            .query({ limit: RUN_ACTOR_AND_FETCH_RESULTS_DEFAULT_ITEMS_LIMIT, clean: true })
            .reply(200, items);
        scope.get(`/v2/datasets/${run.defaultDatasetId}`)
            .reply(200, mockDatasetPublicUrl(run.defaultDatasetId));

        const testResult = await appTester(App.creates.runActorAndFetchResults.operation.perform, bundle);

        expect(testResult.status).to.be.eql(ACTOR_JOB_STATUSES.SUCCEEDED);
        expect(testResult.items).to.be.eql(items);

        scope.done();
    });

    // No timeout and a timeout above the cap both end up at the synchronous cap, same as Run Actor.
    [0, DEFAULT_SYNC_RUN_TIMEOUT_SECS * 2].forEach((timeoutSecs) => {
        it(`caps a ${timeoutSecs}s timeout at the synchronous cap`, async function () {
            if (TEST_USER_TOKEN) this.skip();

            const testActorId = randomString();
            const bundle = {
                authData: { access_token: randomString() },
                inputData: {
                    actorId: testActorId,
                    inputBody: '',
                    build: 'latest',
                    timeoutSecs,
                    memoryMbytes: 1024,
                },
            };

            const run = getMockRun({ actId: testActorId });

            const scope = nock('https://api.apify.com');
            scope.post(`/v2/acts/${testActorId}/runs`)
                .query((query) => query.timeout === `${DEFAULT_SYNC_RUN_TIMEOUT_SECS}` && !!query.webhooks)
                .reply(200, { data: run });

            const startedRun = await appTester(App.creates.runActorAndFetchResults.operation.perform, bundle);

            expect(startedRun.id).to.be.eql(run.id);

            scope.done();
        });
    });

    it('performResume rejects a timed out run and points at the Run Actor action', async function () {
        if (TEST_USER_TOKEN) this.skip();

        const timedOutRun = getMockRun({
            status: ACTOR_JOB_STATUSES.TIMED_OUT,
            options: { timeoutSecs: DEFAULT_SYNC_RUN_TIMEOUT_SECS },
        });
        const bundle = {
            authData: { access_token: randomString() },
            inputData: { actorId: timedOutRun.actId },
            outputData: { id: timedOutRun.id },
        };

        const scope = nock('https://api.apify.com');
        scope.get(`/v2/actor-runs/${timedOutRun.id}`)
            .reply(200, { data: timedOutRun });

        let error;
        try {
            await appTester(App.creates.runActorAndFetchResults.operation.performResume, bundle);
        } catch (err) {
            error = err;
        }

        expect(error.message).to.include(`did not finish within the ${DEFAULT_SYNC_RUN_TIMEOUT_SECS}s timeout`);
        expect(error.message).to.include('use the Run Actor action with "Run synchronously" set to "no"');

        scope.done();
    });

    it('performResume passes a failed run through with whatever items its dataset has', async function () {
        if (TEST_USER_TOKEN) this.skip();

        const failedRun = getMockRun({ status: ACTOR_JOB_STATUSES.FAILED });
        const bundle = {
            authData: { access_token: randomString() },
            inputData: { actorId: failedRun.actId },
            outputData: { id: failedRun.id },
        };

        const scope = nock('https://api.apify.com');
        scope.get(`/v2/actor-runs/${failedRun.id}`)
            .reply(200, { data: failedRun });
        // The size-guard sample fetch (limit 1) that precedes the real fetch below.
        scope.get(`/v2/datasets/${failedRun.defaultDatasetId}/items`)
            .query({ limit: 1, clean: true })
            .reply(200, [{ url: 'http://example.com' }]);
        scope.get(`/v2/datasets/${failedRun.defaultDatasetId}/items`)
            .query({ limit: RUN_ACTOR_AND_FETCH_RESULTS_DEFAULT_ITEMS_LIMIT, clean: true })
            .reply(200, [{ url: 'http://example.com' }]);
        scope.get(`/v2/datasets/${failedRun.defaultDatasetId}`)
            .reply(200, mockDatasetPublicUrl(failedRun.defaultDatasetId));

        const testResult = await appTester(App.creates.runActorAndFetchResults.operation.performResume, bundle);

        expect(testResult.status).to.be.eql(ACTOR_JOB_STATUSES.FAILED);
        expect(testResult.items).to.be.eql([{ url: 'http://example.com' }]);

        scope.done();
    });

    it('throws a descriptive error with Actor ID when the Actor is not found', async function () {
        if (TEST_USER_TOKEN) this.skip();

        const missingActorId = 'this-actor~does-not-exist';
        const bundle = {
            authData: { access_token: randomString() },
            inputData: {
                actorId: missingActorId,
                inputBody: '',
                build: 'latest',
                timeoutSecs: 120,
                memoryMbytes: 1024,
            },
        };

        const scope = nock('https://api.apify.com');
        scope.post(`/v2/acts/${missingActorId}/runs`)
            .query(true)
            .reply(404, { error: { type: 'record-not-found', message: 'Actor was not found' } });

        await expect(appTester(App.creates.runActorAndFetchResults.operation.perform, bundle))
            .to.be.rejectedWith(new RegExp(`Actor "${missingActorId}" was not found`));
        scope.done();
    });

    it('loads the dynamic Actor input fields with wording for an action with no "Run synchronously" field', async () => {
        const actorId = randomString();
        // A build tag with no matching entry in taggedBuilds means no input schema exists,
        // which keeps this test from also having to mock the build-details endpoint.
        const mockActor = getMockActorDetails({ id: actorId, defaultRunOptions: { build: 'no-such-tag', timeoutSecs: 3600, memoryMbytes: 512 } });

        const scope = nock('https://api.apify.com');
        scope.get(`/v2/acts/${actorId}`)
            .reply(200, mockActor);

        const inputFields = App.creates.runActorAndFetchResults.operation.inputFields;
        const getAdditionalFields = inputFields.find((field) => typeof field === 'function');

        const fields = await appTester(getAdditionalFields, {
            authData: { access_token: randomString() },
            inputData: { actorId },
        });

        const timeoutField = fields.find(({ key }) => key === 'timeoutSecs');
        expect(timeoutField.helpText).to.include(`${DEFAULT_SYNC_RUN_TIMEOUT_SECS} seconds`);
        expect(timeoutField.helpText).to.not.include('Run synchronously');

        scope.done();
    });

    it('loads dynamic output fields for dataset items under the items[] prefix', async () => {
        const actorId = randomString();
        const items = [{ a: 1, b: 'text' }];
        const run = getMockRun({ actId: actorId });

        const scope = nock('https://api.apify.com');
        scope.get(`/v2/acts/${actorId}/runs/last`)
            .query({ status: ACTOR_JOB_STATUSES.SUCCEEDED })
            .reply(200, { data: run });
        scope.get(`/v2/datasets/${run.defaultDatasetId}/items`)
            .query({ limit: 10, clean: true })
            .reply(200, items);
        scope.get(`/v2/datasets/${run.defaultDatasetId}`)
            .reply(200, mockDatasetPublicUrl(run.defaultDatasetId));

        const outputFields = App.creates.runActorAndFetchResults.operation.outputFields;
        const getDynamicOutputFields = outputFields.find((field) => typeof field === 'function');

        const fields = await appTester(getDynamicOutputFields, {
            authData: { access_token: randomString() },
            inputData: { actorId },
        });

        expect(fields).to.be.eql([
            { key: 'items[]a', type: 'number' },
            { key: 'items[]b', type: 'string' },
        ]);

        scope.done();
    });
});
