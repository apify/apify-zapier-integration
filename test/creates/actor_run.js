/* eslint-env mocha */
const { EventEmitter } = require('events');

EventEmitter.defaultMaxListeners = 0;

const zapier = require('zapier-platform-core');
const { expect } = require('chai');
const _ = require('lodash');
const nock = require('nock');
const { ACTOR_JOB_STATUSES } = require('@apify/consts');

const { ActorListSortBy } = require('apify-client');
const { createAndBuildActor, TEST_USER_TOKEN, apifyClient, getMockActorDetails, randomString, getMockRun, mockDatasetPublicUrl,
    getMockActorBuild,
    getMockInputSchema,
} = require('../helpers');
const { ACTOR_RUN_SAMPLE, RECENTLY_USED_ACTORS_KEY, DEFAULT_PAGINATION_LIMIT, STORE_ACTORS_KEY, ACTOR_RUN_SAMPLE_SYNC } = require('../../src/consts');

const App = require('../../index');
const { slugifyText, createFieldsFromInputSchemaV1 } = require('../../src/apify_helpers');

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
        nock.cleanAll();
    });

    it('load correctly recently used Actors without input in bundle', async () => {
        const getRealData = async () => {
            const { items } = await apifyClient.actors().list({
                limit: DEFAULT_PAGINATION_LIMIT,
                sortBy: ActorListSortBy.LAST_RUN_STARTED_AT,
                desc: true,
            });

            return items;
        };

        const getMockData = () => [
            getMockActorDetails(),
            getMockActorDetails(),
            getMockActorDetails(),
        ];

        const testData = TEST_USER_TOKEN ? await getRealData() : getMockData();

        const bundle = {
            authData: {
                access_token: TEST_USER_TOKEN,
            },
            inputData: {},
            meta: {},
        };

        let scope;
        if (!TEST_USER_TOKEN) {
            scope = nock('https://api.apify.com');
            scope.get('/v2/acts')
                .query({
                    limit: DEFAULT_PAGINATION_LIMIT,
                    offset: 0,
                    sortBy: ActorListSortBy.LAST_RUN_STARTED_AT,
                    desc: 1,
                })
                .reply(200, {
                    data: { items: testData },
                });
        }

        const result = await appTester(App.triggers.actorsWithStore.operation.perform, bundle);

        expect(result).to.be.an('array');
        expect(result.length).to.be.equal(testData.length);
        result.forEach((actor, index) => {
            expect(actor).to.have.all.keys('id', 'name');
            expect(actor.id).to.equal(testData[index].id);
            expect(actor.name).to.contains(testData[index].name);
        });

        scope?.done();
    }).timeout(120_000);

    it('load correctly recently used Actors', async () => {
        const getRealData = async () => {
            const { items } = await apifyClient.actors().list({
                limit: DEFAULT_PAGINATION_LIMIT,
                sortBy: ActorListSortBy.LAST_RUN_STARTED_AT,
                desc: true,
            });

            return items;
        };

        const getMockData = () => [
            getMockActorDetails(),
            getMockActorDetails(),
            getMockActorDetails(),
        ];

        const testData = TEST_USER_TOKEN ? await getRealData() : getMockData();

        const bundle = {
            authData: {
                access_token: TEST_USER_TOKEN,
            },
            inputData: {
                searchLocation: RECENTLY_USED_ACTORS_KEY,
            },
            meta: {},
        };

        let scope;
        if (!TEST_USER_TOKEN) {
            scope = nock('https://api.apify.com');
            scope.get('/v2/acts')
                .query({
                    limit: DEFAULT_PAGINATION_LIMIT,
                    offset: 0,
                    sortBy: ActorListSortBy.LAST_RUN_STARTED_AT,
                    desc: 1,
                })
                .reply(200, {
                    data: { items: testData },
                });
        }

        const result = await appTester(App.triggers.actorsWithStore.operation.perform, bundle);

        expect(result).to.be.an('array');
        expect(result.length).to.be.equal(testData.length);
        result.forEach((actor, index) => {
            expect(actor).to.have.all.keys('id', 'name');
            expect(actor.id).to.equal(testData[index].id);
            expect(actor.name).to.contains(testData[index].name);
        });

        scope?.done();
    }).timeout(120_000);

    it('load correctly recently used Actors - page 2', async () => {
        const getRealData = async () => {
            const { items } = await apifyClient.actors().list({
                limit: DEFAULT_PAGINATION_LIMIT,
                offset: DEFAULT_PAGINATION_LIMIT,
                sortBy: ActorListSortBy.LAST_RUN_STARTED_AT,
                desc: true,
            });

            return items;
        };

        const getMockData = () => [
            getMockActorDetails(),
            getMockActorDetails(),
            getMockActorDetails(),
        ];

        const testData = TEST_USER_TOKEN ? await getRealData() : getMockData();

        const bundle = {
            authData: {
                access_token: TEST_USER_TOKEN,
            },
            inputData: {
                searchLocation: RECENTLY_USED_ACTORS_KEY,
            },
            meta: {
                page: 1, // Simulate page 2
            },
        };

        let scope;
        if (!TEST_USER_TOKEN) {
            scope = nock('https://api.apify.com');
            scope.get('/v2/acts')
                .query({
                    limit: DEFAULT_PAGINATION_LIMIT,
                    offset: DEFAULT_PAGINATION_LIMIT,
                    sortBy: ActorListSortBy.LAST_RUN_STARTED_AT,
                    desc: 1,
                })
                .reply(200, {
                    data: { items: testData },
                });
        }

        const result = await appTester(App.triggers.actorsWithStore.operation.perform, bundle);

        expect(result).to.be.an('array');
        expect(result.length).to.be.equal(testData.length);
        result.forEach((actor, index) => {
            expect(actor).to.have.all.keys('id', 'name');
            expect(actor.id).to.equal(testData[index].id);
            expect(actor.name).to.contains(testData[index].name);
        });

        scope?.done();
    }).timeout(120_000);

    if (!TEST_USER_TOKEN) {
        it('load correctly Actors from the Apify store', async () => {
            const getRealData = async () => {
                EventEmitter.setMaxListeners(100);

                const { items } = await apifyClient.store().list({
                    limit: DEFAULT_PAGINATION_LIMIT,
                    sortBy: 'popularity',
                });

                return items;
            };

            const getMockData = () => [
                getMockActorDetails(),
                getMockActorDetails(),
                getMockActorDetails(),
            ];

            const testData = TEST_USER_TOKEN ? await getRealData() : getMockData();

            const bundle = {
                authData: {
                    access_token: TEST_USER_TOKEN,
                },
                inputData: {
                    searchLocation: STORE_ACTORS_KEY,
                },
                meta: {},
            };

            let scope;
            if (!TEST_USER_TOKEN) {
                scope = nock('https://api.apify.com');
                scope.get('/v2/store')
                    .query({
                        limit: DEFAULT_PAGINATION_LIMIT,
                        offset: 0,
                        sortBy: 'popularity',
                    })
                    .reply(200, {
                        data: { items: testData },
                    });
            }

            const result = await appTester(App.triggers.actorsWithStore.operation.perform, bundle);

            expect(result).to.be.an('array');
            expect(result.length).to.be.equal(testData.length);
            result.forEach((actor, index) => {
                expect(actor).to.have.all.keys('id', 'name');
                expect(actor.id).to.equal(testData[index].id);
                expect(actor.name).to.contains(testData[index].name);
            });

            scope?.done();
        }).timeout(120_000);

        it('load correctly Actors from the Apify store - page 2', async () => {
            const getRealData = async () => {
                EventEmitter.setMaxListeners(100);

                const { items } = await apifyClient.store().list({
                    limit: DEFAULT_PAGINATION_LIMIT,
                    offset: DEFAULT_PAGINATION_LIMIT,
                    sortBy: 'popularity',
                });

                return items;
            };

            const getMockData = () => [
                getMockActorDetails(),
                getMockActorDetails(),
                getMockActorDetails(),
            ];

            const testData = TEST_USER_TOKEN ? await getRealData() : getMockData();

            const bundle = {
                authData: {
                    access_token: TEST_USER_TOKEN,
                },
                inputData: {
                    searchLocation: STORE_ACTORS_KEY,
                },
                meta: {
                    page: 1, // Simulate page 2
                },
            };

            let scope;
            if (!TEST_USER_TOKEN) {
                scope = nock('https://api.apify.com');
                scope.get('/v2/store')
                    .query({
                        limit: DEFAULT_PAGINATION_LIMIT,
                        offset: DEFAULT_PAGINATION_LIMIT,
                        sortBy: 'popularity',
                    })
                    .reply(200, {
                        data: { items: testData },
                    });
            }

            const result = await appTester(App.triggers.actorsWithStore.operation.perform, bundle);

            expect(result).to.be.an('array');
            expect(result.length).to.be.equal(testData.length);
            result.forEach((actor, index) => {
                expect(actor).to.have.all.keys('id', 'name');
                expect(actor.id).to.equal(testData[index].id);
                expect(actor.name).to.contains(testData[index].name);
            });

            scope?.done();
        }).timeout(120_000);
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
    }).timeout(120_000);

    it('loading of dynamic fields from inputSchema work - mock', async () => {
        const bundle = {
            authData: {
                access_token: 'test-token',
            },
            inputData: {
                actorId: testActorId,
            },
        };

        const mockActor = getMockActorDetails({ id: testActorId });
        const mockInputSchema = getMockInputSchema();
        const mockBuild = getMockActorBuild({
            id: mockActor.taggedBuilds.latest.buildId,
            actId: testActorId,
            inputSchema: JSON.stringify(mockInputSchema),
        });

        const scope = nock('https://api.apify.com');
        scope.get(`/v2/acts/${testActorId}`)
            .reply(200, mockActor);
        scope.get(`/v2/acts/${testActorId}/builds/${mockBuild.id}`)
            .reply(200, mockBuild);

        const fields = await appTester(App.triggers.getActorAdditionalFieldsTest.operation.perform, bundle);

        const fieldKeys = fields.map(({ key }) => key);
        Object.entries(mockInputSchema.properties).forEach(([propKey, prop]) => {
            // Make sure all top level properties are present in the fields
            expect(fieldKeys.includes(`input-${propKey}`) || fieldKeys.includes(`input-${slugifyText(prop.title)}`)).to.be.equal(true);
        });

        const subschemaField = fields.find(({ key }) => key === 'input-object-with-sub-schema');
        const subschemaProperty = mockInputSchema.properties.subschemaObject;
        expect(subschemaField.label).to.be.equal(subschemaProperty.title);
        expect(subschemaField.helpText).to.be.equal(subschemaProperty.description);
        const firstKeyField = subschemaField.children.find(({ key }) => key === 'input-subschemaObject.key1');
        const firstKeyProperty = subschemaProperty.properties.key1;
        expect(firstKeyField.label).to.be.equal(firstKeyProperty.title);
        expect(firstKeyField.helpText).to.be.equal(firstKeyProperty.description);
        expect(firstKeyField.type).to.be.equal('string');
        expect(firstKeyField.default).to.be.equal(subschemaProperty.prefill.key1);
        const secondKeyField = subschemaField.children.find(({ key }) => key === 'input-subschemaObject.key2');
        const secondKeyProperty = subschemaProperty.properties.key2;
        expect(secondKeyField.label).to.be.equal(secondKeyProperty.title);
        expect(secondKeyField.helpText).to.be.equal(secondKeyProperty.description);
        expect(secondKeyField.type).to.be.equal('string');
        expect(secondKeyField.default).to.be.equal(subschemaProperty.prefill.key2);

        const stringArrayField = fields.find(({ key }) => key === 'input-stringArray');
        const stringArrayProperty = mockInputSchema.properties.stringArray;
        expect(stringArrayField.label).to.be.equal(stringArrayProperty.title);
        expect(stringArrayField.helpText).to.be.equal(stringArrayProperty.description);
        expect(stringArrayField.type).to.be.equal('string');
        expect(stringArrayField.list).to.be.equal(true);

        const numberArrayField = fields.find(({ key }) => key === 'input-numberArray');
        const numberArrayProperty = mockInputSchema.properties.numberArray;
        expect(numberArrayField.label).to.be.equal(numberArrayProperty.title);
        expect(numberArrayField.helpText).to.be.equal(numberArrayProperty.description);
        expect(numberArrayField.type).to.be.equal('integer');
        expect(numberArrayField.list).to.be.equal(true);

        const boolArrayField = fields.find(({ key }) => key === 'input-boolArray');
        const boolArrayProperty = mockInputSchema.properties.boolArray;
        expect(boolArrayField.label).to.be.equal(boolArrayProperty.title);
        expect(boolArrayField.helpText).to.be.equal(boolArrayProperty.description);
        expect(boolArrayField.type).to.be.equal('boolean');
        expect(boolArrayField.list).to.be.equal(true);

        const objectArrayField = fields.find(({ key }) => key === 'input-objectArray');
        const objectArrayProperty = mockInputSchema.properties.objectArray;
        expect(objectArrayField.label).to.be.equal(objectArrayProperty.title);
        expect(objectArrayField.helpText).to.be.equal(objectArrayProperty.description);
        expect(objectArrayField.type).to.be.equal('text');

        scope.done();
    });

    if (TEST_USER_TOKEN) {
        it('loading of dynamic fields from inputSchema work - real', async () => {
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
            scope.get(`/v2/datasets/${run.defaultDatasetId}`)
                .reply(200, mockDatasetPublicUrl(items.defaultDatasetId));
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

    it('runAsync work - mock', async () => {
        const mockActor = getMockActorDetails({ id: testActorId });
        const mockInputSchema = getMockInputSchema();
        const mockBuild = getMockActorBuild({
            id: mockActor.taggedBuilds.latest.buildId,
            actId: testActorId,
            inputSchema: JSON.stringify(mockInputSchema),
        });
        const mockRun = getMockRun({ actId: testActorId });

        const runOptions = {
            build: 'latest',
            timeoutSecs: 120,
            memoryMbytes: 256,
        };

        const actorInput = {
            'input-object-with-sub-schema': [{
                'input-object-with-sub-schema.key1': 'test-key-1',
                'input-object-with-sub-schema.key2': 'test-key-2',
            }],
            'input-stringArray': ['str1', 'str2'],
            'input-numberArray': [1, 2, 3],
            'input-boolArray': [true, false],
            'input-objectArray': JSON.stringify([
                { keyA: 'valueA', keyB: 'valueB' },
            ]),
        };

        const bundle = {
            authData: {
                access_token: 'test-token',
            },
            inputData: {
                actorId: testActorId,
                runSync: false,
                ...runOptions,
                ...actorInput,
            },
        };

        const scope = nock('https://api.apify.com');
        scope.get(`/v2/acts/${testActorId}`)
            .reply(200, mockActor);
        scope.get(`/v2/acts/${testActorId}/builds/${mockBuild.id}`)
            .reply(200, mockBuild);
        scope.post(`/v2/acts/${testActorId}/runs`, (body) => {
            expect(body.subschemaObject).to.deep.equal({ key1: 'test-key-1', key2: 'test-key-2' });
            expect(body.stringArray).to.deep.equal(['str1', 'str2']);
            expect(body.numberArray).to.deep.equal([1, 2, 3]);
            expect(body.boolArray).to.deep.equal([true, false]);
            expect(body.objectArray).to.deep.equal([{ keyA: 'valueA', keyB: 'valueB' }]);
            return true;
        })
            .query({ build: runOptions.build, timeout: runOptions.timeoutSecs, memory: runOptions.memoryMbytes })
            .reply(201, { data: mockRun });
        scope.get(`/v2/key-value-stores/${mockRun.defaultKeyValueStoreId}/records/OUTPUT`)
            .reply(200, { foo: 'bar' });
        scope.get(`/v2/datasets/${mockRun.defaultDatasetId}/items`)
            .query({ limit: 100, clean: true })
            .reply(200, [{ foo: 'bar' }]);
        scope.get(`/v2/datasets/${mockRun.defaultDatasetId}`)
            .reply(200, mockDatasetPublicUrl(mockRun.defaultDatasetId));

        await appTester(App.creates.createActorRun.operation.perform, bundle);

        scope.done();
    });

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
                .query({ waitForFinish: 60 })
                .reply(200, { data: run });
            scope.get(`/v2/key-value-stores/${run.defaultKeyValueStoreId}/records/OUTPUT`)
                .reply(200, { foo: 'bar' });
            scope.get(`/v2/datasets/${run.defaultDatasetId}/items`)
                .query({ limit: 100, clean: true })
                .reply(200, [{ foo: 'bar' }]);
            scope.get(`/v2/datasets/${run.defaultDatasetId}`)
                .reply(200, mockDatasetPublicUrl(run.defaultDatasetId));
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
                .query({ waitForFinish: 60 })
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
            scope.get(`/v2/datasets/${run.defaultDatasetId}`)
                .reply(200, mockDatasetPublicUrl(run.defaultDatasetId));
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
            scope.get(`/v2/datasets/${ACTOR_RUN_SAMPLE.defaultDatasetId}`)
                .reply(200, mockDatasetPublicUrl(ACTOR_RUN_SAMPLE.defaultDatasetId));
        }

        const testResult = await appTester(App.creates.createActorRun.operation.perform, bundle);
        expect(testResult).to.have.all.keys(_.without(Object.keys(ACTOR_RUN_SAMPLE), 'exitCode'));
        expect(testResult.finishedAt).to.be.eql(null);

        scope?.done();
    }).timeout(50000);
});

/**
 * Test input schema conversion for various input schema patterns.
 * These tests verify that the conversion function handles different input schema patterns
 * without throwing errors, including edge cases like enumSuggestedValues, schemaBased editors,
 * and nested properties.
 */
describe('input schema conversion', () => {
    const mockActor = { id: 'test-actor', title: 'Test Actor', name: 'test-actor', username: 'test' };

    it('should handle enumSuggestedValues in select editor (Website Content Crawler pattern)', () => {
        const inputSchema = {
            title: 'Test Schema',
            type: 'object',
            schemaVersion: 1,
            properties: {
                saveContentTypes: {
                    title: 'Save linked files with Content-Type',
                    description: 'The crawler downloads files linked from the web pages',
                    type: 'string',
                    editor: 'select',
                    enumSuggestedValues: ['image/*', 'application/*, text/csv'],
                    enumTitles: ['Images: image/*', 'Documents: application/*, text/csv'],
                },
            },
        };

        const fields = createFieldsFromInputSchemaV1(inputSchema, mockActor);
        expect(fields).to.be.an('array');
        expect(fields.length).to.be.greaterThan(0);

        const saveContentTypesField = fields.find((f) => f.key === 'input-saveContentTypes');
        expect(saveContentTypesField).to.not.be.undefined;
        expect(saveContentTypesField.choices).to.deep.equal({
            'image/*': 'Images: image/*',
            'application/*, text/csv': 'Documents: application/*, text/csv',
        });
    });

    it('should handle schemaBased editor with nested properties (Google Maps Scraper pattern)', () => {
        const inputSchema = {
            title: 'Test Schema',
            type: 'object',
            schemaVersion: 1,
            properties: {
                scrapeSocialMediaProfiles: {
                    title: 'Social media profile enrichment',
                    type: 'object',
                    description: 'Enable enrichment for social media profiles',
                    editor: 'schemaBased',
                    default: {
                        facebooks: false,
                        instagrams: false,
                    },
                    prefill: {
                        facebooks: false,
                        instagrams: false,
                    },
                    properties: {
                        facebooks: {
                            title: 'Enable Facebook profile scraping',
                            type: 'boolean',
                            description: 'Enable scraping detailed Facebook profile information',
                        },
                        instagrams: {
                            title: 'Enable Instagram profile scraping',
                            type: 'boolean',
                            description: 'Enable scraping detailed Instagram profile information',
                        },
                    },
                },
            },
        };

        const fields = createFieldsFromInputSchemaV1(inputSchema, mockActor);
        expect(fields).to.be.an('array');
        expect(fields.length).to.be.greaterThan(0);

        const schemaBasedField = fields.find((f) => f.key === 'input-social-media-profile-enrichment');
        expect(schemaBasedField).to.not.be.undefined;
        expect(schemaBasedField.children).to.be.an('array');
        expect(schemaBasedField.children.length).to.equal(2);
    });

    it('should handle enum with enumTitles (standard select)', () => {
        const inputSchema = {
            title: 'Test Schema',
            type: 'object',
            schemaVersion: 1,
            properties: {
                language: {
                    title: 'Language',
                    description: 'Results details will show in this language',
                    enum: ['en', 'de', 'fr'],
                    enumTitles: ['English', 'German', 'French'],
                    type: 'string',
                    editor: 'select',
                    default: 'en',
                },
            },
        };

        const fields = createFieldsFromInputSchemaV1(inputSchema, mockActor);
        expect(fields).to.be.an('array');

        const languageField = fields.find((f) => f.key === 'input-language');
        expect(languageField).to.not.be.undefined;
        expect(languageField.choices).to.deep.equal({
            en: 'English',
            de: 'German',
            fr: 'French',
        });
    });

    it('should handle array with select editor and items.enum', () => {
        const inputSchema = {
            title: 'Test Schema',
            type: 'object',
            schemaVersion: 1,
            properties: {
                categories: {
                    title: 'Categories',
                    type: 'array',
                    description: 'Select categories to filter',
                    editor: 'select',
                    items: {
                        type: 'string',
                        enum: ['restaurant', 'hotel', 'cafe'],
                        enumTitles: ['Restaurant', 'Hotel', 'Cafe'],
                    },
                },
            },
        };

        const fields = createFieldsFromInputSchemaV1(inputSchema, mockActor);
        expect(fields).to.be.an('array');

        const categoriesField = fields.find((f) => f.key === 'input-categories');
        expect(categoriesField).to.not.be.undefined;
        expect(categoriesField.list).to.be.true;
        expect(categoriesField.choices).to.deep.equal({
            restaurant: 'Restaurant',
            hotel: 'Hotel',
            cafe: 'Cafe',
        });
    });

    it('should gracefully handle malformed input schema fields', () => {
        const inputSchema = {
            title: 'Test Schema',
            type: 'object',
            schemaVersion: 1,
            properties: {
                validField: {
                    title: 'Valid Field',
                    type: 'string',
                    description: 'A valid field',
                },
                // This field has editor='select' but no enum or enumSuggestedValues
                // It should be handled gracefully without throwing
                incompleteSelectField: {
                    title: 'Incomplete Select',
                    type: 'string',
                    editor: 'select',
                    // missing enum and enumSuggestedValues
                },
            },
        };

        // Should not throw
        const fields = createFieldsFromInputSchemaV1(inputSchema, mockActor);
        expect(fields).to.be.an('array');

        // Valid field should be present
        const validField = fields.find((f) => f.key === 'input-validField');
        expect(validField).to.not.be.undefined;
    });

    it('should handle hidden editor fields by excluding them', () => {
        const inputSchema = {
            title: 'Test Schema',
            type: 'object',
            schemaVersion: 1,
            properties: {
                visibleField: {
                    title: 'Visible Field',
                    type: 'string',
                    description: 'A visible field',
                },
                hiddenField: {
                    title: 'Hidden Field',
                    type: 'string',
                    editor: 'hidden',
                },
            },
        };

        const fields = createFieldsFromInputSchemaV1(inputSchema, mockActor);

        const visibleField = fields.find((f) => f.key === 'input-visibleField');
        expect(visibleField).to.not.be.undefined;

        const hiddenField = fields.find((f) => f.key === 'input-hiddenField');
        expect(hiddenField).to.be.undefined;
    });

    // Integration tests with real actors (only run when TEST_USER_TOKEN is available)
    const TEST_ACTOR_IDS = [
        'nwua9Gu5YrADL7ZDj', // Google Maps Scraper
        'aYG0l9s7dbB7j3gbS', // Website Content Crawler
        'GdWCkxBtKWOsKjdch',
        '2APbAvDfNDOWXbkWf',
        'h7sDV53CddomktSi5',
        'shu8hvrXbJbY3Eb9W',
        'KoJrdxJCTtpon81KY',
        '61RPP7dywgiy0JPD0',
    ];

    if (TEST_USER_TOKEN) {
        TEST_ACTOR_IDS.forEach((actorId) => {
            it(`should convert input schema for real actor ${actorId} without errors`, async () => {
                const actor = await apifyClient.actor(actorId).get();
                expect(actor).to.not.be.undefined;

                // Get the latest build to fetch input schema
                const builds = await apifyClient.actor(actorId).builds().list({ limit: 1, desc: true });
                if (!builds.items.length) {
                    console.log(`  Skipping actor ${actorId}: No builds found`);
                    return;
                }

                const build = await apifyClient.actor(actorId).build(builds.items[0].id).get();
                if (!build.inputSchema) {
                    console.log(`  Skipping actor ${actorId}: No input schema found`);
                    return;
                }

                const inputSchema = JSON.parse(build.inputSchema);
                expect(inputSchema).to.have.property('properties');

                // This should not throw - if it does, the test fails
                const fields = createFieldsFromInputSchemaV1(inputSchema, actor);

                expect(fields).to.be.an('array');
                expect(fields.length).to.be.greaterThan(0);

                // Verify that fields have required properties
                fields.forEach((field) => {
                    expect(field).to.have.property('key');
                    expect(field).to.have.property('label');
                });

                console.log(`  Actor ${actorId} (${actor.title || actor.name}): ${fields.length} fields generated`);
            }).timeout(30000);
        });
    }
});
