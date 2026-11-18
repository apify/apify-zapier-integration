/* eslint-env mocha */
const { EventEmitter } = require('events');

EventEmitter.defaultMaxListeners = 0;

const zapier = require('zapier-platform-core');
const chai = require('chai');
const chaiAsPromised = require('chai-as-promised');
const nock = require('nock');
const { KEY_VALUE_STORE_KEY_REGEX } = require('@apify/consts');

const { randomString, TEST_USER_TOKEN, getMockDataset, getMockKVStore, mockDatasetPublicUrl } = require('./helpers');
const { waitForRunToFinish, getRemainingTestStepWaitSecs, isValidApiPathSegment } = require('../src/request_helpers');
const { TEST_STEP_RUN_WAIT_SECS } = require('../src/consts');

chai.use(chaiAsPromised);
const { expect } = chai;

const App = require('../index');

const appTester = zapier.createAppTester(App);

describe('request helpers', () => {
    // These tests exercise the centralized afterResponse middleware (validateApiResponse in
    // src/request_helpers.js). We drive it through the createActorRun perform, but because the error
    // handling is central it covers every run path (actor run, task run, scrape URL).
    describe('validateApiResponse middleware', () => {
        afterEach(() => {
            nock.cleanAll();
        });

        const runOptions = {
            build: 'latest',
            timeoutSecs: 120,
            memoryMbytes: 1024,
        };

        const getBundle = (actorId) => ({
            authData: {
                access_token: 'test-token',
            },
            inputData: {
                actorId,
                // Passing inputBody skips the input-schema fetch, so the run POST is the only request.
                inputBody: '',
                runSync: false,
                ...runOptions,
            },
        });

        it('surfaces the approvalUrl for unapproved full-permission Actors', async () => {
            const testActorId = randomString();
            const approvalUrl = `https://console.apify.com/actors/${testActorId}?approvePermissions=true`;

            const scope = nock('https://api.apify.com');
            scope.post(`/v2/acts/${testActorId}/runs`)
                .query({
                    timeout: runOptions.timeoutSecs,
                    memory: runOptions.memoryMbytes,
                    build: runOptions.build,
                })
                .reply(403, {
                    error: {
                        type: 'full-permission-actor-not-approved',
                        message: 'This Actor requires full access to your account. You must approve its permissions before running it.',
                        data: { approvalUrl },
                    },
                });

            const promise = appTester(App.creates.createActorRun.operation.perform, getBundle(testActorId));

            await expect(promise).to.be.rejectedWith(/approvePermissions=true/);
            // It must be a z.errors.Error (halts the step), not a bare Error.
            await expect(promise).to.be.rejectedWith(zapier.errors.Error);

            scope.done();
        });

        it('throws a clear error when full-permission type matches but approvalUrl is missing', async () => {
            const testActorId = randomString();
            const message = 'This Actor requires full access to your account. You must approve its permissions before running it.';

            const scope = nock('https://api.apify.com');
            scope.post(`/v2/acts/${testActorId}/runs`)
                .query({
                    timeout: runOptions.timeoutSecs,
                    memory: runOptions.memoryMbytes,
                    build: runOptions.build,
                })
                .reply(403, {
                    error: {
                        type: 'full-permission-actor-not-approved',
                        message,
                        // No data.approvalUrl on purpose.
                    },
                });

            const promise = appTester(App.creates.createActorRun.operation.perform, getBundle(testActorId));

            await expect(promise).to.be.rejectedWith(zapier.errors.Error);
            await expect(promise).to.be.rejectedWith(message);

            scope.done();
        });
    });

    describe('getRemainingTestStepWaitSecs', () => {
        it('subtracts the time already spent in the step', () => {
            expect(getRemainingTestStepWaitSecs(Date.now())).to.be.closeTo(TEST_STEP_RUN_WAIT_SECS, 0.1);
            expect(getRemainingTestStepWaitSecs(Date.now() - 5000)).to.be.closeTo(TEST_STEP_RUN_WAIT_SECS - 5, 0.1);
        });

        it('never goes below zero', () => {
            expect(getRemainingTestStepWaitSecs(Date.now() - (TEST_STEP_RUN_WAIT_SECS * 2 * 1000))).to.be.eql(0);
        });
    });

    describe('waitForRunToFinish', () => {
        const runId = 'HG7ML7M8z78YcAPEB';

        it('returns the run once it reaches a terminal status', async () => {
            const statuses = ['RUNNING', 'RUNNING', 'SUCCEEDED'];
            let calls = 0;
            const request = async (options) => {
                expect(options.url).to.be.eql(`https://api.apify.com/v2/actor-runs/${runId}`);
                expect(options.params.waitForFinish).to.be.at.most(5);
                calls++;
                return { data: { id: runId, status: statuses.shift() } };
            };

            const run = await waitForRunToFinish(request, runId, 5);

            expect(run.status).to.be.eql('SUCCEEDED');
            expect(calls).to.be.eql(3);
        }).timeout(10000);

        it('returns the run from the last poll when the wait runs out', async () => {
            let calls = 0;
            const request = async () => {
                calls++;
                return { data: { id: runId, status: 'RUNNING', stats: { computeUnits: calls } } };
            };

            const run = await waitForRunToFinish(request, runId, 2);

            expect(run.status).to.be.eql('RUNNING');
            expect(run.stats.computeUnits).to.be.eql(calls);
        }).timeout(10000);

        it('returns null without polling when there is no wait budget left', async () => {
            const request = () => { throw new Error('request should not be called for a zero timeout'); };

            expect(await waitForRunToFinish(request, runId, 0)).to.be.eql(null);
        });

        it('returns the last polled run instead of throwing when a poll fails', async () => {
            let calls = 0;
            const request = async () => {
                calls++;
                if (calls > 1) throw new Error('Apify API is down');
                return { data: { id: runId, status: 'RUNNING' } };
            };

            const run = await waitForRunToFinish(request, runId, 5);

            expect(run.status).to.be.eql('RUNNING');
        }).timeout(10000);

        it('returns null when even the first poll fails', async () => {
            const request = async () => { throw new Error('Apify API is down'); };

            expect(await waitForRunToFinish(request, runId, 5)).to.be.eql(null);
        }).timeout(10000);
    });

    describe('isValidApiPathSegment', () => {
        it('accepts IDs and names', () => {
            ['HG7ML7M8z78YcAPEB', 'apify~web-scraper', '~my-store', 'john.doe_1~my-actor', 'test_run-id', '...']
                .forEach((value) => expect(isValidApiPathSegment(value), value).to.be.eql(true));
        });

        it('rejects anything else', () => {
            ['', '.', '..', 'a/b', '../acts', 'a\\b', 'a?b', 'a#b', 'a%2Fb', 'a b', '{{123__id}}', undefined, null, 123]
                .forEach((value) => expect(isValidApiPathSegment(value), String(value)).to.be.eql(false));
        });

        it('checks against a given format, and still rejects "." and ".."', () => {
            expect(isValidApiPathSegment("it's-(ok)!", KEY_VALUE_STORE_KEY_REGEX)).to.be.eql(true);
            expect(isValidApiPathSegment('apify~web-scraper', KEY_VALUE_STORE_KEY_REGEX)).to.be.eql(false);
            ['.', '..'].forEach((value) => expect(isValidApiPathSegment(value, KEY_VALUE_STORE_KEY_REGEX), value).to.be.eql(false));
        });
    });
});

describe('resource IDs and names in request URLs', () => {
    const INVALID_VALUE_MESSAGE = /isn't a valid ID or name/;
    const authData = { access_token: TEST_USER_TOKEN };

    // Every operation that puts an ID or name from its input into a request path, with otherwise valid input.
    const OPERATIONS = [
        { name: 'Get Actor Run by ID', perform: App.searches.getActorRunById.operation.perform, field: 'runId' },
        { name: 'Abort Actor Run', perform: App.creates.abortActorRun.operation.perform, field: 'runId' },
        {
            name: 'Run Task',
            perform: App.creates.createTaskRun.operation.perform,
            field: 'taskId',
            inputData: { runSync: false, rawInput: '{}' },
        },
        {
            name: 'Run Actor',
            perform: App.creates.createActorRun.operation.perform,
            field: 'actorId',
            inputData: { runSync: false, inputBody: '{}', inputContentType: 'application/json' },
        },
        {
            name: 'Run Actor and Fetch Results',
            perform: App.creates.runActorAndFetchResults.operation.perform,
            field: 'actorId',
            inputData: { inputBody: '{}', inputContentType: 'application/json' },
        },
        { name: 'Find Last Actor Run', perform: App.searches.searchActorRun.operation.perform, field: 'actorId' },
        { name: 'Find Last Task Run', perform: App.searches.searchTaskRun.operation.perform, field: 'taskId' },
        // A `/` becomes `~` here, so `a/b` stays one segment and isn't tested.
        { name: 'Get Actor Details', perform: App.searches.getActorDetails.operation.perform, field: 'actorId', skip: ['../users/me'] },
        { name: 'Fetch Dataset Items', perform: App.searches.fetchDatasetItems.operation.perform, field: 'datasetIdOrName' },
        {
            name: 'Get Key-Value Store Record',
            perform: App.searches.keyValueStoreGetValue.operation.perform,
            field: 'storeIdOrName',
            inputData: { key: 'OUTPUT' },
        },
        {
            name: 'Set Key-Value Store Record',
            perform: App.creates.keyValueStoreSetValue.operation.perform,
            field: 'storeIdOrName',
            inputData: { key: 'OUTPUT', value: '{}' },
        },
        { name: 'Finished Actor Run (sample runs)', perform: App.triggers.actorRunFinished.operation.performList, field: 'actorId' },
        { name: 'Finished Task Run (sample runs)', perform: App.triggers.taskRunFinished.operation.performList, field: 'taskId' },
    ];
    const INVALID_VALUES = ['../users/me', '..\\users\\me', 'abc?limit=1', 'abc#x', '..', '.'];

    // Requests without a matching interceptor. Net connect is disabled, so none of them leaves the process.
    let unmatchedRequests;
    const recordUnmatchedRequest = (req) => unmatchedRequests.push(`${req.method} ${req.path}`);

    beforeEach(function () {
        // A regression would send these requests, so they never run against the live API.
        if (TEST_USER_TOKEN) this.skip();
        nock.disableNetConnect();
        unmatchedRequests = [];
        nock.emitter.on('no match', recordUnmatchedRequest);
    });

    afterEach(() => {
        nock.emitter.removeListener('no match', recordUnmatchedRequest);
        nock.cleanAll();
        nock.enableNetConnect();
    });

    OPERATIONS.forEach(({ name, perform, field, inputData = {}, skip = [] }) => {
        INVALID_VALUES.filter((value) => !skip.includes(value)).forEach((value) => {
            it(`${name} rejects ${field} "${value}" without sending a request`, async () => {
                const bundle = { authData, inputData: { ...inputData, [field]: value } };

                await expect(appTester(perform, bundle)).to.be.rejectedWith(INVALID_VALUE_MESSAGE);
                expect(unmatchedRequests).to.be.eql([]);
            });
        });
    });

    it('Get Actor Details keeps a username/name slug as one path segment', async () => {
        const scope = nock('https://api.apify.com')
            .get('/v2/acts/..~users~me')
            .reply(404, { error: { type: 'record-not-found', message: 'Actor was not found' } });

        const bundle = { authData, inputData: { actorId: '../users/me' } };
        expect(await appTester(App.searches.getActorDetails.operation.perform, bundle)).to.be.eql([]);
        scope.done();
    });

    // The lookup response is the only source of these IDs. They are still encoded, so a request can't leave its path.
    describe('storage ID from the lookup response', () => {
        const STORAGE_ID = 'abc/def?x=1';
        const ENCODED_STORAGE_ID = 'abc%2Fdef%3Fx%3D1';

        it('Get Key-Value Store Record percent-encodes it in the record URL', async () => {
            const scope = nock('https://api.apify.com');
            scope.get('/v2/key-value-stores/~my-store')
                .reply(200, { data: getMockKVStore({ id: STORAGE_ID }) });
            scope.head(`/v2/key-value-stores/${ENCODED_STORAGE_ID}/records/OUTPUT`)
                .reply(404);

            const bundle = { authData, inputData: { storeIdOrName: 'my-store', key: 'OUTPUT' } };
            await expect(appTester(App.searches.keyValueStoreGetValue.operation.perform, bundle))
                .to.be.rejectedWith(/No record found for key/);
            expect(unmatchedRequests).to.be.eql([]);
            scope.done();
        });

        it('Set Key-Value Store Record percent-encodes it in the record URL', async () => {
            const scope = nock('https://api.apify.com');
            scope.get('/v2/key-value-stores/my-store')
                .reply(200, { data: getMockKVStore({ id: STORAGE_ID }) });
            scope.put(`/v2/key-value-stores/${ENCODED_STORAGE_ID}/records/OUTPUT`)
                .reply(201);

            const bundle = { authData, inputData: { storeIdOrName: 'my-store', key: 'OUTPUT', value: '{}' } };
            const result = await appTester(App.creates.keyValueStoreSetValue.operation.perform, bundle);

            expect(result.keyValueStoreRecordUrl)
                .to.be.eql(`https://api.apify.com/v2/key-value-stores/${ENCODED_STORAGE_ID}/records/OUTPUT`);
            expect(unmatchedRequests).to.be.eql([]);
            scope.done();
        });

        it('Fetch Dataset Items percent-encodes it in the items URL', async () => {
            const items = [{ name: 'test' }];
            const scope = nock('https://api.apify.com');
            scope.get('/v2/datasets/~my-dataset')
                .reply(200, { data: getMockDataset({ id: STORAGE_ID }) });
            scope.get(`/v2/datasets/${ENCODED_STORAGE_ID}/items`)
                .query(true)
                .reply(200, items);
            // The public file URLs come from apify-client, which builds its own URL.
            scope.get('/v2/datasets/abc~def')
                .query(true)
                .reply(200, mockDatasetPublicUrl(STORAGE_ID));

            const bundle = { authData, inputData: { datasetIdOrName: 'my-dataset' } };
            const result = await appTester(App.searches.fetchDatasetItems.operation.perform, bundle);

            expect(result[0].items).to.be.eql(items);
            expect(unmatchedRequests).to.be.eql([]);
            scope.done();
        });
    });

    it('the Actor input fields show "Actor not found" for an invalid Actor without sending a request', async () => {
        const bundle = { authData, inputData: { actorId: '{{123__actorId}}' } };

        const fields = await appTester(App.triggers.getActorAdditionalFieldsTest.operation.perform, bundle);

        expect(fields).to.have.lengthOf(1);
        expect(fields[0]).to.include({ key: 'actorNotFound', type: 'copy' });
        expect(unmatchedRequests).to.be.eql([]);
    });

    it('the dataset output fields fall back to the defaults for an invalid ID without sending a request', async () => {
        const getOutputFieldsLoader = ({ outputFields }) => outputFields[outputFields.length - 1];
        const loaders = [
            [getOutputFieldsLoader(App.searches.getActorRunById.operation), { runId: '../users/me' }],
            [getOutputFieldsLoader(App.searches.searchActorRun.operation), { actorId: '../users/me' }],
            [getOutputFieldsLoader(App.searches.searchTaskRun.operation), { taskId: '../users/me' }],
        ];

        const results = await Promise.all(loaders.map(([loader, inputData]) => appTester(loader, { authData, inputData })));
        expect(results).to.be.eql([[], [], []]);
        expect(unmatchedRequests).to.be.eql([]);
    });
});
