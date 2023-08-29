const axios = require('axios');
const zapier = require('zapier-platform-core');
const { expect } = require('chai');
const _ = require('lodash');
const { createAndBuildActor, TEST_USER_TOKEN, apifyClient } = require('../helpers');
const { ACTOR_RUN_SAMPLE } = require('../../src/consts');

const searchApiBaseUrl = 'https://api.apify.com/v2/store';

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

    it('load correctly Actors with Actors from store with hidden trigger', async () => {
        const bundle = {
            authData: {
                token: TEST_USER_TOKEN,
            },
            inputData: {},
            meta: {},
        };

        const allUserActors = [];
        let actorListPage;
        do {
            actorListPage = await apifyClient.actors().list({ limit: 500, offset: allUserActors.length });
            allUserActors.push(...actorListPage.items);
        } while (actorListPage.items.length > 0);

        const allPublicActor = [];
        let storeActorList;
        do {
            ({ data: { data: storeActorList } } = await axios({
                url: searchApiBaseUrl,
                params: { offset: allPublicActor.length, limit: 100 },
            }));
            allPublicActor.push(...storeActorList.items);
        } while (storeActorList.items.length);

        const actors = [];
        let page = 0;
        let actorList;
        do {
            actorList = await appTester(App.triggers.actorsWithStore.operation.perform, {
                ...bundle,
                meta: {
                    page: page === 0 ? undefined : page,
                },
            });
            actors.push(...actorList);
            page++;
        } while (actorList.length);

        expect(allUserActors.concat(allPublicActor).map((a) => a.id)).to.include.members(actors.map((a) => a.id));
        actors.forEach((actor) => {
            expect(actor).to.have.all.keys('id', 'name');
        });
    }).timeout(120000);

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
        const { properties } = JSON.parse(inputSchema);

        const fields = await appTester(App.triggers.getActorAdditionalFieldsTest.operation.perform, bundle);
        const fieldKeys = fields.map(({ key }) => key);
        Object.keys(properties).forEach((keyToFind) => {
            expect(fieldKeys.includes(`input-${keyToFind}`)).to.be.equal(true);
        });
        // Test fields edge cases
        const startUrlsField = fields.find(({ key }) => key === 'input-startUrls');
        const startUrlsFieldSchema = properties.startUrls;
        expect(startUrlsField.label).to.be.equal(startUrlsFieldSchema.title);
        expect(startUrlsField.helpText).to.be.equal(startUrlsFieldSchema.description);
        expect(startUrlsField.default).to.be.deep.equal(startUrlsFieldSchema.prefill.map(({ url }) => url)[0]);

        const pseudoUrlsField = fields.find(({ key }) => key === 'input-pseudoUrls');
        const pseudoUrlsFieldSchema = properties.pseudoUrls;
        expect(pseudoUrlsField.label).to.be.equal(pseudoUrlsFieldSchema.title);
        expect(pseudoUrlsField.helpText).to.be.equal(pseudoUrlsFieldSchema.description);
        expect(pseudoUrlsField.default).to.be.deep.equal(pseudoUrlsFieldSchema.prefill.map(({ purl }) => purl)[0]);

        const proxyConfigurationField = fields.find(({ key }) => key === 'input-proxyConfiguration');
        const proxyConfigurationFieldSchema = properties.proxyConfiguration;
        expect(proxyConfigurationField.label).to.be.equal(proxyConfigurationFieldSchema.title);
        expect(proxyConfigurationField.helpText).to.be.equal(proxyConfigurationFieldSchema.description);
        expect(proxyConfigurationField.default).to.be.equal(JSON.stringify(proxyConfigurationFieldSchema.prefill, null, 2));

        const waitUntilField = fields.find(({ key }) => key === 'input-waitUntil');
        const waitUntilFieldSchema = properties.waitUntil;
        expect(waitUntilField.label).to.be.equal(waitUntilFieldSchema.title);
        expect(waitUntilField.helpText).to.be.equal(waitUntilFieldSchema.description);
        expect(waitUntilField.type).to.be.equal('text');
        expect(waitUntilField.default).to.be.equal(JSON.stringify(waitUntilFieldSchema.prefill, null, 2));
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
            inputData: {
                actorId: testActorId,
                inputBody: '',
                runSync: true,
                ...runOptions,
            },
        };

        const testResult = await appTester(App.creates.createActorRun.operation.perform, bundle);
        const actorRun = await apifyClient.run(testResult.id).get();

        expect(testResult).to.have.all.keys(Object.keys(ACTOR_RUN_SAMPLE));
        expect(testResult.status).to.be.eql('SUCCEEDED');
        expect(testResult.finishedAt).to.not.equal(null);
        expect(testResult.OUTPUT).to.be.eql({ foo: 'bar' });
        Object.keys(runOptions).forEach((key) => {
            expect(actorRun.options[key]).to.be.eql(runOptions[key]);
        });
    }).timeout(120000);

    it('runSync handles output as file', async () => {
        const runOptions = {
            build: 'latest',
            timeoutSecs: 120,
            memoryMbytes: 1024,
        };
        const bundle = {
            authData: {
                token: TEST_USER_TOKEN,
            },
            inputData: {
                actorId: testActorId,
                runSync: true,
                inputBody: JSON.stringify({
                    outputRandomFile: true,
                }),
                inputContentType: 'application/json; charset=utf-8',
                ...runOptions,
            },
        };

        const testResult = await appTester(App.creates.createActorRun.operation.perform, bundle);
        const actorRun = await apifyClient.run(testResult.id).get();

        expect(testResult).to.have.all.keys(Object.keys(ACTOR_RUN_SAMPLE));
        expect(testResult.status).to.be.eql('SUCCEEDED');
        expect(testResult.finishedAt).to.not.equal(null);
        expect(testResult.OUTPUT).to.be.eql({
            file: `https://api.apify.com/v2/key-value-stores/${testResult.defaultKeyValueStoreId}/records/OUTPUT`,
            filename: 'OUTPUT',
            contentType: 'text/plain; charset=utf-8',
        });
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
                inputBody: '',
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
