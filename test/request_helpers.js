/* eslint-env mocha */
const chai = require('chai');
const chaiAsPromised = require('chai-as-promised');

const { ACTOR_JOB_STATUSES } = require('@apify/consts');

const { DEFAULT_RUN_WAIT_TIME_OUT_SECONDS } = require('../src/consts');
const { waitForRunToFinish } = require('../src/request_helpers');

chai.use(chaiAsPromised);
const { expect } = chai;

describe('request helpers', () => {
    describe('waitForRunToFinish', () => {
        it('throws an actionable, run-scoped error when the synchronous timeout is reached', async () => {
            const runId = 'HG7ML7M8z78YcAPEB';
            // A zero timeout makes the polling loop exit immediately, so no request is issued and no interval is awaited.
            const request = () => { throw new Error('request should not be called for a zero timeout'); };

            const promise = waitForRunToFinish(request, runId, 0);

            await expect(promise).to.be.rejectedWith(/did not finish within the 0s synchronous timeout/);
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

        it('caps waitForFinish at the synchronous timeout and stops on a terminal status', async () => {
            const runId = 'HG7ML7M8z78YcAPEB';
            const requestedUrls = [];
            const request = (options) => {
                requestedUrls.push(options.url);
                return { data: { id: runId, status: ACTOR_JOB_STATUSES.SUCCEEDED } };
            };

            const run = await waitForRunToFinish(request, runId, DEFAULT_RUN_WAIT_TIME_OUT_SECONDS);

            expect(run.status).to.be.eql(ACTOR_JOB_STATUSES.SUCCEEDED);
            expect(requestedUrls).to.have.lengthOf(1);
            expect(requestedUrls[0]).to.include(`waitForFinish=${DEFAULT_RUN_WAIT_TIME_OUT_SECONDS}`);
        });

        it('never asks the API to wait longer than the synchronous timeout', async function () {
            this.timeout(5000);
            const runId = 'HG7ML7M8z78YcAPEB';
            const requestedUrls = [];
            // The real API blocks for waitForFinish seconds, the delay here mimics that.
            const request = async (options) => {
                requestedUrls.push(options.url);
                await new Promise((resolve) => { setTimeout(resolve, 300); });
                return { data: { id: runId, status: ACTOR_JOB_STATUSES.RUNNING } };
            };

            await expect(waitForRunToFinish(request, runId, 1)).to.be.rejectedWith(/did not finish within the 1s synchronous timeout/);

            expect(requestedUrls.length).to.be.at.least(1);
            requestedUrls.forEach((url) => {
                const waitForFinish = Number(url.split('waitForFinish=')[1]);
                expect(waitForFinish).to.be.at.most(1);
                expect(waitForFinish).to.be.at.least(1);
            });
        });
    });
});
