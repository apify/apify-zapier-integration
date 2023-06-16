const zapier = require('zapier-platform-core');
const { ACTOR_JOB_STATUSES } = require('@apify/consts');
const { expect } = require('chai');
const { apifyClient, TEST_USER_TOKEN, createAndBuildActor } = require('../helpers');

const App = require('../../index');

const appTester = zapier.createAppTester(App);

describe('search actor last run', () => {
    let testActorId;

    before(async function () {
        this.timeout(120000); // We need time to build actor
        // Create actor for testing
        const actor = await createAndBuildActor();
        testActorId = actor.id;
    });

    it('work for actor without run', async () => {
        const bundle = {
            authData: {
                token: TEST_USER_TOKEN,
            },
            inputData: {
                actorId: testActorId,
                status: ACTOR_JOB_STATUSES.SUCCEEDED,
            },
        };

        const testResult = await appTester(App.searches.searchActorRun.operation.perform, bundle);

        expect(testResult.length).to.be.eql(0);
    });

    it('work', async () => {
        const bundle = {
            authData: {
                token: TEST_USER_TOKEN,
            },
            inputData: {
                actorId: testActorId,
                status: ACTOR_JOB_STATUSES.SUCCEEDED,
            },
        };

        const actorRun = await apifyClient.actor(testActorId).call({ waitSecs: 120 });

        const testResult = await appTester(App.searches.searchActorRun.operation.perform, bundle);

        expect(testResult[0].status).to.be.eql(ACTOR_JOB_STATUSES.SUCCEEDED);
        expect(testResult[0].id).to.be.eql(actorRun.id);
    }).timeout(240000);

    after(async () => {
        await apifyClient.actor(testActorId).delete();
    });
});
