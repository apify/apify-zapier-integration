const zapier = require('zapier-platform-core');
const { expect } = require('chai');
const _ = require('lodash');
const { createAndBuildActor, TEST_USER_TOKEN, apifyClient } = require('../helpers');
const { ACTOR_RUN_SAMPLE } = require('../../src/consts');

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

    it('loading of dynamic fields from exampleRunInput work', async () => {
        const actorFields = {
            defaultRunOptions: {
                build: 'test',
                timeoutSecs: 300,
                memoryMbytes: 512,
            },
            exampleRunInput: {
                contentType: 'application/json',
                body: JSON.stringify({ myField: 'myValue' }),
            },
        };
        await apifyClient.actor(testActorId).update(actorFields);

        const bundle = {
            authData: {
                token: TEST_USER_TOKEN,
            },
            inputData: {
                actorId: testActorId,
            },
        };

        const fields = await appTester(App.triggers.getActorAdditionalFieldsTest.operation.perform, bundle);
        const fieldsByKey = _.keyBy(fields, 'key');

        expect(actorFields.defaultRunOptions.build).to.be.eql(fieldsByKey.build.default);
        expect(actorFields.defaultRunOptions.timeoutSecs).to.be.eql(fieldsByKey.timeoutSecs.default);
        expect(actorFields.defaultRunOptions.memoryMbytes).to.be.eql(parseInt(fieldsByKey.memoryMbytes.default));
        expect(actorFields.exampleRunInput.contentType).to.be.eql(fieldsByKey.inputContentType.default);
        expect(JSON.parse(actorFields.exampleRunInput.body)).to.be.eql(JSON.parse(fieldsByKey.inputBody.default));
    });

    it('loading of dynamic fields from inputSchema work', async () => {
        // Actor with input schema
        const actorId = 'apify~web-scraper';
        const bundle = {
            authData: {
                token: TEST_USER_TOKEN,
            },
            inputData: {
                // Actor with input schema
                actorId,
            },
        };
        const actor = await apifyClient.actor(actorId).get();
        const { buildId } = actor.taggedBuilds[actor.defaultRunOptions.build];
        const { inputSchema } = await apifyClient.build(buildId).get();

        const fields = await appTester(App.triggers.getActorAdditionalFieldsTest.operation.perform, bundle);

        expect(Object.keys(JSON.parse(inputSchema).properties)).to.include.all.keys(Object.keys(fields));
    }).timeout(120000);

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
        const actorRun = await apifyClient.run(testResult.id).get();

        expect(testResult).to.have.all.keys(Object.keys(ACTOR_RUN_SAMPLE));
        expect(testResult.status).to.be.eql('SUCCEEDED');
        expect(testResult.finishedAt).to.not.equal(null);
        Object.keys(runOptions).forEach((key) => {
            expect(actorRun.options[key]).to.be.eql(runOptions[key]);
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
        expect(testResult).to.have.all.keys(_.without(Object.keys(ACTOR_RUN_SAMPLE), 'exitCode'));
        expect(testResult.finishedAt).to.be.eql(null);
    }).timeout(50000);

    after(async () => {
        await apifyClient.actor(testActorId).delete();
    });
});
