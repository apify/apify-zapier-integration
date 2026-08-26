/* eslint-env mocha */
const { expect } = require('chai');

const { waitForRunToFinish, getRemainingTestStepWaitSecs } = require('../src/request_helpers');
const { TEST_STEP_RUN_WAIT_SECS } = require('../src/consts');

describe('request helpers', () => {
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
