const zapier = require('zapier-platform-core');
const { expect } = require('chai');
const { createAndBuildActor, TEST_USER_TOKEN, apifyClient } = require('../helpers');

const App = require('../../index');

const appTester = zapier.createAppTester(App);

describe('create actor run', () => {
    let testActorId;

    before(async function () {
        this.timeout(120000); // We need time to build actor
        // Create actor for testing
        const actor = await createAndBuildActor();
        testActorId = actor.id;
    });

    // it('loading of dynamic fields work', async () => {
    //     // TODO
    // });

    it('runSync work', async () => {
        const runOptions = {
            build: 'latest',
            timeoutSecs: 120,
            memoryMbytes: 1024,
        };
        const bundle = {
            authData: {
                token: TEST_USER_TOKEN,
            },
            inputData: Object.assign({
                actorId: testActorId,
                runSync: true,
            }, runOptions),
        };

        const testResult = await appTester(App.creates.createActorRun.operation.perform, bundle);

        expect(testResult.status).to.be.eql('SUCCEEDED');
        expect(testResult.finishedAt).to.not.equal(null);
        Object.keys(runOptions).forEach((key) => {
            expect(testResult.options[key]).to.be.eql(runOptions[key]);
        });
    }).timeout(120000);

    it('runAsync work', async () => {
        const bundle = {
            authData: {
                token: TEST_USER_TOKEN,
            },
            inputData: {
                actorId: testActorId,
                runSync: false,
                build: 'latest',
                timeoutSecs: 120,
                memoryMbytes: 1024,
            },
        };

        const testResult = await appTester(App.creates.createActorRun.operation.perform, bundle);
        expect(testResult.finishedAt).to.be.eql(null);
    });

    after(async () => {
        await apifyClient.acts.deleteAct({ actId: testActorId });
    });
});
