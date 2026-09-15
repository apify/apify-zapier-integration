/* eslint-env mocha */
const { EventEmitter } = require('events');

EventEmitter.defaultMaxListeners = 0;

const zapier = require('zapier-platform-core');
const chai = require('chai');
const chaiAsPromised = require('chai-as-promised');
const nock = require('nock');

const { randomString } = require('./helpers');
const { waitForRunToFinish, getRemainingTestStepWaitSecs } = require('../src/request_helpers');
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
});
