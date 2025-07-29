/* eslint-env mocha */
const { EventEmitter } = require('events');

EventEmitter.defaultMaxListeners = 0;

const zapier = require('zapier-platform-core');
const { expect } = require('chai');
const _ = require('lodash');
const nock = require('nock');
const { ACTOR_JOB_STATUSES } = require('@apify/consts');

const { createAndBuildActor, TEST_USER_TOKEN, apifyClient, getMockActorDetails, randomString, getMockRun } = require('../helpers');
const { ACTOR_RUN_SAMPLE, ACTOR_RUN_SAMPLE_SYNC } = require('../../src/consts');

const App = require('../../index');

const appTester = zapier.createAppTester(App);

describe('create actor run', () => {
    let testActorId = randomString();

    before(async function () {
        if (TEST_USER_TOKEN) {
            this.timeout(120000); // We need time to build actor
            // Create actor for testing
            const actor = await createAndBuildActor();
            testActorId = actor.id;
        }
    });

    after(async () => {
        if (TEST_USER_TOKEN) {
            await apifyClient.actor(testActorId).delete();
        }
    });

    afterEach(async () => {
        if (!TEST_USER_TOKEN) {
            nock.cleanAll();
        }
    });

    // This test whether retrieving actors from store works
    // TODO: This test is disabled because the requests to the Apify store API ends with Premature close error.
    if (TEST_USER_TOKEN) {
        it('load correctly Actors with Actors from store with hidden trigger', async () => {
            // Increase max listeners to avoid warning about too many listeners
            EventEmitter.setMaxListeners(100);

            const bundle = {
                authData: {
                    access_token: TEST_USER_TOKEN,
                },
                inputData: {},
                meta: {},
            };

            const userActors = await apifyClient.actors().list({ limit: 1000, my: true });
            const publicActor = await apifyClient.store().list({ limit: 10 });

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

            expect(actors.map((a) => a.id)).to.include.members(userActors.items.concat(publicActor.items).map((a) => a.id));
            actors.forEach((actor) => {
                expect(actor).to.have.all.keys('id', 'name');
            });
        }).timeout(300_000); // Timeout of 5 minutes to allow apify client to load all Actors from store and user's Actors
    }

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

        if (TEST_USER_TOKEN) {
            await apifyClient.actor(testActorId).update(actorFields);
        }

        const bundle = {
            authData: {
                access_token: TEST_USER_TOKEN,
            },
            inputData: {
                actorId: testActorId,
            },
        };

        let scope;
        if (!TEST_USER_TOKEN) {
            scope = nock('https://api.apify.com');
            scope.get(`/v2/acts/${testActorId}`)
                .reply(200, {
                    data: getMockActorDetails(actorFields),
                });
        }

        const fields = await appTester(App.triggers.getActorAdditionalFieldsTest.operation.perform, bundle);
        const fieldsByKey = _.keyBy(fields, 'key');

        expect(actorFields.defaultRunOptions.build).to.be.eql(fieldsByKey.build.default);
        expect(actorFields.defaultRunOptions.timeoutSecs).to.be.eql(fieldsByKey.timeoutSecs.default);
        expect(actorFields.defaultRunOptions.memoryMbytes).to.be.eql(parseInt(fieldsByKey.memoryMbytes.default, 10));
        expect(actorFields.exampleRunInput.contentType).to.be.eql(fieldsByKey.inputContentType.default);
        expect(JSON.parse(actorFields.exampleRunInput.body)).to.be.eql(JSON.parse(fieldsByKey.inputBody.default));

        scope?.done();
    }).timeout(30_000);

    if (TEST_USER_TOKEN) {
        it('loading of dynamic fields from inputSchema work', async () => {
            // Actor with input schema
            const actorId = 'apify~web-scraper';
            const bundle = {
                authData: {
                    access_token: TEST_USER_TOKEN,
                },
                inputData: {
                    // Actor with input schema
                    actorId,
                },
            };
            const actor = await apifyClient.actor(actorId).get();
            const { buildId } = actor.taggedBuilds[actor.defaultRunOptions.build];
            const { actorDefinition: { input: inputSchema } } = await apifyClient.build(buildId).get();
            const { properties } = inputSchema;

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
    }

    it('loading of dynamic output fields for dataset items work', async () => {
        const bundle = {
            authData: {
                access_token: TEST_USER_TOKEN,
            },
            inputData: {
                // Actor with input schema
                actorId: testActorId,
            },
        };
        const items = [
            { a: 1, b: 2, c: 'c', d: 'd' },
            { a: 2, b: 3, c: 'c', d: 'd' },
            { a: 3, b: 4, e: { a: 1, b: 2 } },
            { a: 4, b: 5, f: new Date() },
            { a: 4, b: 5, g: ['a', 'b'], h: [{ a: 1, b: 2 }] },
        ];

        let scope;
        if (TEST_USER_TOKEN) {
            // Run an Actor, the output items will be generated based on latest success run
            await apifyClient.actor(testActorId).call({
                datasetItems: items,
            }, { build: 'latest' });
        } else {
            const run = getMockRun();

            scope = nock('https://api.apify.com');
            scope.get(`/v2/acts/${testActorId}/runs/last`)
                .query({ status: ACTOR_JOB_STATUSES.SUCCEEDED })
                .reply(200, { data: run });
            scope.get(`/v2/datasets/${run.defaultDatasetId}/items`)
                .query({ limit: 10, clean: true })
                .reply(200, items);
        }

        const fields = await appTester(App.triggers.getActorDatasetOutputFieldsTest.operation.perform, bundle);
        expect(fields).to.be.eql([
            { key: 'datasetItems[]a', type: 'number' },
            { key: 'datasetItems[]b', type: 'number' },
            { key: 'datasetItems[]c', type: 'string' },
            { key: 'datasetItems[]d', type: 'string' },
            { key: 'datasetItems[]e__a', type: 'number' },
            { key: 'datasetItems[]e__b', type: 'number' },
            { key: 'datasetItems[]f', type: 'datetime' },
            { key: 'datasetItems[]g', type: 'string', list: true },
            { key: 'datasetItems[]h[]a', type: 'number' },
            { key: 'datasetItems[]h[]b', type: 'number' },
        ]);

        scope?.done();
    }).timeout(120000);

    it('runSync work', async () => {
        const runOptions = {
            build: 'latest',
            timeoutSecs: 120,
            memoryMbytes: 1024,
        };
        const bundle = {
            authData: {
                access_token: TEST_USER_TOKEN,
            },
            inputData: {
                actorId: testActorId,
                inputBody: '',
                runSync: true,
                ...runOptions,
            },
        };

        let scope;
        if (!TEST_USER_TOKEN) {
            const run = getMockRun({ actId: testActorId, options: runOptions });

            scope = nock('https://api.apify.com');
            scope.post(`/v2/acts/${testActorId}/runs`)
                .query({
                    timeout: runOptions.timeoutSecs,
                    memory: runOptions.memoryMbytes,
                    build: runOptions.build,
                })
                .reply(200, { data: run });
            scope.get(`/v2/actor-runs/${run.id}`)
                .reply(200, { data: run });
            scope.get(`/v2/actor-runs/${run.id}`)
                .query(true)
                .reply(200, { data: run });
            scope.get(`/v2/key-value-stores/${run.defaultKeyValueStoreId}/records/OUTPUT`)
                .reply(200, { foo: 'bar' });
            scope.get(`/v2/datasets/${run.defaultDatasetId}/items`)
                .query({ limit: 100, clean: true })
                .reply(200, [{ foo: 'bar' }]);
        }

        const testResult = await appTester(App.creates.createActorRun.operation.perform, bundle);
        const actorRun = await apifyClient.run(testResult.id).get();
        expect(testResult).to.have.all.keys(Object.keys(ACTOR_RUN_SAMPLE_SYNC));
        expect(testResult.status).to.be.eql('SUCCEEDED');
        expect(testResult.finishedAt).to.not.equal(null);
        expect(testResult.OUTPUT).to.be.eql({ foo: 'bar' });
        Object.keys(runOptions).forEach((key) => {
            expect(actorRun.options[key]).to.be.eql(runOptions[key]);
        });

        scope?.done();
    }).timeout(120000);

    it('runSync handles output as file', async () => {
        const runOptions = {
            build: 'latest',
            timeoutSecs: 120,
            memoryMbytes: 1024,
        };
        const bundle = {
            authData: {
                access_token: TEST_USER_TOKEN,
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

        let scope;
        if (!TEST_USER_TOKEN) {
            const run = getMockRun({ actId: testActorId, options: runOptions });

            scope = nock('https://api.apify.com');
            scope.post(`/v2/acts/${testActorId}/runs`)
                .query({
                    timeout: runOptions.timeoutSecs,
                    memory: runOptions.memoryMbytes,
                    build: runOptions.build,
                })
                .reply(200, { data: run });
            scope.get(`/v2/actor-runs/${run.id}`)
                .reply(200, { data: run });
            scope.get(`/v2/actor-runs/${run.id}`)
                .query(true)
                .reply(200, { data: run });
            scope.get(`/v2/key-value-stores/${run.defaultKeyValueStoreId}/records/OUTPUT`)
                .reply(200, {
                    file: `https://api.apify.com/v2/key-value-stores/${run.defaultKeyValueStoreId}/records/OUTPUT`,
                    filename: 'OUTPUT',
                    contentType: 'text/plain; charset=utf-8',
                });
            scope.get(`/v2/datasets/${run.defaultDatasetId}/items`)
                .query({ limit: 100, clean: true })
                .reply(200, [{ foo: 'bar' }]);
        }

        const testResult = await appTester(App.creates.createActorRun.operation.perform, bundle);
        const actorRun = await apifyClient.run(testResult.id).get();

        expect(testResult).to.have.all.keys(Object.keys(ACTOR_RUN_SAMPLE_SYNC));
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

        scope?.done();
    }).timeout(120000);

    it('runAsync work', async () => {
        const bundle = {
            authData: {
                access_token: TEST_USER_TOKEN,
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

        let scope;
        if (!TEST_USER_TOKEN) {
            const mockActorRun = { ...ACTOR_RUN_SAMPLE, finishedAt: null };
            delete mockActorRun.exitCode;

            scope = nock('https://api.apify.com');
            scope.post(`/v2/acts/${testActorId}/runs`)
                .query({
                    timeout: 120,
                    memory: 1024,
                    build: 'latest',
                })
                .reply(200, { data: mockActorRun });
            scope.get(`/v2/key-value-stores/${mockActorRun.defaultKeyValueStoreId}/records/OUTPUT`)
                .reply(200, {});
            scope.get(`/v2/datasets/${ACTOR_RUN_SAMPLE.defaultDatasetId}/items`)
                .query({ limit: 100, clean: true })
                .reply(200, []);
        }

        const testResult = await appTester(App.creates.createActorRun.operation.perform, bundle);
        expect(testResult).to.have.all.keys(_.without(Object.keys(ACTOR_RUN_SAMPLE), 'exitCode'));
        expect(testResult.finishedAt).to.be.eql(null);

        scope?.done();
    }).timeout(50000);
});
