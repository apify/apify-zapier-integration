/* eslint-env mocha */
const chai = require('chai');
const chaiAsPromised = require('chai-as-promised');

const { ACTOR_JOB_STATUSES } = require('@apify/consts');

const { DEFAULT_RUN_WAIT_TIME_OUT_SECONDS, ZAPIER_STEP_TIMEOUT_SECONDS } = require('../src/consts');
const { waitForRunToFinish, getRemainingSyncWaitSecs } = require('../src/request_helpers');

chai.use(chaiAsPromised);
const { expect } = chai;

describe('request helpers', () => {
    describe('waitForRunToFinish', () => {
        it('throws an actionable, run-scoped error when the synchronous timeout is reached', async () => {
            const runId = 'HG7ML7M8z78YcAPEB';
            // A zero timeout makes the polling loop exit immediately, so no request is issued and no interval is awaited.
            const request = () => { throw new Error('request should not be called for a zero timeout'); };

            const promise = waitForRunToFinish(request, runId, 0);

            await expect(promise).to.be.rejectedWith(new RegExp(`did not finish within the ${ZAPIER_STEP_TIMEOUT_SECONDS}s limit`));
            await expect(promise).to.be.rejectedWith(new RegExp(`run ID: ${runId}`));
            await expect(promise).to.be.rejectedWith(new RegExp(`console.apify.com/view/runs/${runId}`));
        });

        it('guides users to an asynchronous two-Zap flow', async () => {
            const runId = 'HG7ML7M8z78YcAPEB';
            const request = () => { throw new Error('request should not be called for a zero timeout'); };

            await expect(waitForRunToFinish(request, runId, 0, true)).to.be.rejectedWith(/set "Run synchronously" to "no"/);
            await expect(waitForRunToFinish(request, runId, 0, false)).to.be.rejectedWith(/use the Run Actor action/);
            await expect(waitForRunToFinish(request, runId, 0, false)).to.be.rejectedWith(/Finished Actor Run trigger/);
        });

        it('caps waitForFinish at the remaining budget and at the API maximum', async () => {
            const runId = 'HG7ML7M8z78YcAPEB';
            const requestedUrls = [];
            const request = (options) => {
                requestedUrls.push(options.url);
                return { data: { id: runId, status: ACTOR_JOB_STATUSES.SUCCEEDED } };
            };

            const run = await waitForRunToFinish(request, runId, DEFAULT_RUN_WAIT_TIME_OUT_SECONDS);
            await waitForRunToFinish(request, runId, 360);

            expect(run.status).to.be.eql(ACTOR_JOB_STATUSES.SUCCEEDED);
            expect(requestedUrls).to.have.lengthOf(2);
            expect(requestedUrls[0]).to.include(`waitForFinish=${DEFAULT_RUN_WAIT_TIME_OUT_SECONDS}`);
            expect(requestedUrls[1]).to.include('waitForFinish=60');
        });

        it('never waits past the deadline, even when the API returns early', async function () {
            this.timeout(5000);
            const runId = 'HG7ML7M8z78YcAPEB';
            const timeoutSecs = 2;
            let requestCount = 0;
            // Returning immediately with a non-terminal status is the worst case for the polling loop.
            const request = () => {
                requestCount++;
                return { data: { id: runId, status: ACTOR_JOB_STATUSES.RUNNING } };
            };

            const startedAt = Date.now();
            await expect(waitForRunToFinish(request, runId, timeoutSecs)).to.be.rejectedWith(/did not finish within/);

            expect(Date.now() - startedAt).to.be.at.most(timeoutSecs * 1000 + 500);
            expect(requestCount).to.be.within(1, timeoutSecs + 1);
        });
    });

    describe('getRemainingSyncWaitSecs', () => {
        it('shrinks with the time already spent in the step, never below a second', () => {
            expect(getRemainingSyncWaitSecs(Date.now())).to.be.eql(DEFAULT_RUN_WAIT_TIME_OUT_SECONDS);
            expect(getRemainingSyncWaitSecs(Date.now() - 5000)).to.be.eql(DEFAULT_RUN_WAIT_TIME_OUT_SECONDS - 5);
            expect(getRemainingSyncWaitSecs(Date.now() - 600000)).to.be.eql(1);
        });
    });
});
