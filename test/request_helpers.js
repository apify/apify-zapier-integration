/* eslint-env mocha */
const { EventEmitter } = require('events');

EventEmitter.defaultMaxListeners = 0;

const zapier = require('zapier-platform-core');
const chai = require('chai');
const chaiAsPromised = require('chai-as-promised');
const nock = require('nock');

const { randomString } = require('./helpers');

chai.use(chaiAsPromised);
const { expect } = chai;

const App = require('../index');

const appTester = zapier.createAppTester(App);

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
