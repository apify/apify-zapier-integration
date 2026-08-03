/* eslint-env mocha */
const chai = require('chai');
const chaiAsPromised = require('chai-as-promised');

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

        it('includes the async-mode hint only when the caller exposes the Run synchronously field', async () => {
            const runId = 'HG7ML7M8z78YcAPEB';
            const request = () => { throw new Error('request should not be called for a zero timeout'); };

            await expect(waitForRunToFinish(request, runId, 0, true)).to.be.rejectedWith(/Run synchronously/);
            await expect(waitForRunToFinish(request, runId, 0, false)).to.not.be.rejectedWith(/Run synchronously/);
        });
    });
});
