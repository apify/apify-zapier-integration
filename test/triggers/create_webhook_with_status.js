const zapier = require('zapier-platform-core');
const { expect } = require('chai');
const nock = require('nock');
const { WEBHOOK_EVENT_TYPES, WEBHOOK_EVENT_TYPE_GROUPS, ACTOR_JOB_STATUSES} = require('@apify/consts');

const App = require('../../index');
const {randomString } = require('../helpers');

const appTester = zapier.createAppTester(App);

describe('actor and task webhook creation', () => {
    const testActorId = 'test-actor-id';
    const testTaskId = 'test-task-id';
    const testToken = 'test-token';

    afterEach(() => {
        nock.cleanAll();
    });

    it('create webhook with status failed and timed out for actor run', async () => {
        const requestUrl = `http://example.com/#${randomString()}`;
        const bundle = {
            targetUrl: requestUrl,
            authData: {
                token: testToken,
            },
            inputData: {
                actorId: testActorId,
                statuses: ['FAILED', 'TIMED-OUT'],
            },
            meta: {},
        };

        const scope = nock('https://api.apify.com')
            .post('/v2/webhooks', (payload) => {
                expect(payload).to.have.property('requestUrl', requestUrl);
                expect(payload).to.have.property('condition').that.has.property('actorId', testActorId);
                expect(payload).to.have.property('eventTypes')
                    .that.includes(WEBHOOK_EVENT_TYPES.ACTOR_RUN_FAILED, WEBHOOK_EVENT_TYPES.ACTOR_RUN_TIMED_OUT)
                    .and.not.includes([
                        WEBHOOK_EVENT_TYPES.ACTOR_RUN_SUCCEEDED,
                        WEBHOOK_EVENT_TYPES.ACTOR_RUN_ABORTED,
                    ]);
                return true;
            })
            .query(true)
            .reply(201, {});

        await appTester(App.triggers.actorRunFinished.operation.performSubscribe, bundle);
        scope.done();
    });

    it('create webhook with status aborted for task run', async () => {
        const requestUrl = `http://example.com/#${randomString()}`;
        const bundle = {
            targetUrl: requestUrl,
            authData: {
                token: testToken,
            },
            inputData: {
                taskId: testTaskId,
                statuses: ['ABORTED'],
            },
            meta: {},
        };

        const scope = nock('https://api.apify.com')
            .post('/v2/webhooks', (payload) => {
                expect(payload).to.have.property('requestUrl', requestUrl);
                expect(payload).to.have.property('condition').that.has.property('actorTaskId', testTaskId);
                expect(payload).to.have.property('eventTypes')
                    .that.includes(WEBHOOK_EVENT_TYPES.ACTOR_RUN_ABORTED)
                    .and.not.includes([
                        WEBHOOK_EVENT_TYPES.ACTOR_RUN_SUCCEEDED,
                        WEBHOOK_EVENT_TYPES.ACTOR_RUN_TIMED_OUT,
                        WEBHOOK_EVENT_TYPES.ACTOR_RUN_FAILED,
                    ]);
                return true;
            })
            .query(true)
            .reply(201, {});

        await appTester(App.triggers.taskRunFinished.operation.performSubscribe, bundle);
        scope.done();
    });

    it('create webhook with both wrong and correct value', async () => {
        const requestUrl = `http://example.com/#${randomString()}`;
        const bundle = {
            targetUrl: requestUrl,
            authData: {
                token: testToken,
            },
            inputData: {
                actorId: testActorId,
                statuses: ['FAILED', 'WRONG_STATUS'],
            },
            meta: {},
        };

        const scope = nock('https://api.apify.com')
            .post('/v2/webhooks', (payload) => {
                expect(payload).to.have.property('requestUrl', requestUrl);
                expect(payload).to.have.property('condition').that.has.property('actorId', testActorId);
                expect(payload).to.have.property('eventTypes')
                    .that.includes(WEBHOOK_EVENT_TYPES.ACTOR_RUN_FAILED)
                    .and.not.includes([
                        WEBHOOK_EVENT_TYPES.ACTOR_RUN_SUCCEEDED,
                        WEBHOOK_EVENT_TYPES.ACTOR_RUN_TIMED_OUT,
                        WEBHOOK_EVENT_TYPES.ACTOR_RUN_ABORTED,
                    ]);
                return true;
            })
            .query(true)
            .reply(201, {});

        await appTester(App.triggers.actorRunFinished.operation.performSubscribe, bundle);
        scope.done();
    });

    it('create webhook with with wrong values', async () => {
        const requestUrl = `http://example.com/#${randomString()}`;
        const bundle = {
            targetUrl: requestUrl,
            authData: {
                token: testToken,
            },
            inputData: {
                actorId: testActorId,
                statuses: ['WRONG_STATUS'],
            },
            meta: {},
        };

        const scope = nock('https://api.apify.com')
            .post('/v2/webhooks', (payload) => {
                expect(payload).to.have.property('requestUrl', requestUrl);
                expect(payload).to.have.property('condition').that.has.property('actorId', testActorId);
                expect(payload).to.have.property('eventTypes')
                    .that.includes(...WEBHOOK_EVENT_TYPE_GROUPS.ACTOR_RUN_TERMINAL);
                return true;
            })
            .query(true)
            .reply(201, {});

        await appTester(App.triggers.actorRunFinished.operation.performSubscribe, bundle);
        scope.done();
    });
});
