/* eslint-env mocha */
const { expect } = require('chai');
const FieldSchema = require('zapier-platform-schema/lib/schemas/FieldSchema');
const makeValidator = require('zapier-platform-schema/lib/utils/makeValidator');
const nock = require('nock');
const zapier = require('zapier-platform-core');

const { getPrefilledValuesFromInputSchema, createFieldsFromInputSchemaV1, maybeGetInputSchemaFromActor } = require('../src/apify_helpers');
const { APIFY_API_ENDPOINTS } = require('../src/consts');
const webScraperInputSchemaJson = require('./helpers/webScraperInputSchema.json');
const websiteContentCrawlerInputSchema = require('./helpers/websiteContentCrawlerInputSchema.json');
const generatedInputSchema = require('./helpers/generatedInputSchema.json');
const { randomString, TEST_USER_TOKEN } = require('./helpers');
const App = require('../index');

describe('apify utils', () => {
    it('getPrefilledValuesFromInputSchema work', () => {
        const prefillValues = getPrefilledValuesFromInputSchema(webScraperInputSchemaJson);
        const expected = {
            startUrls: [{ url: 'https://apify.com' }],
            pseudoUrls: [{ purl: 'https://apify.com[(/[\\w-]+)?]' }],
            linkSelector: 'a',
            pageFunction: 'async function pageFunction(context) {\n    const { request, log } = context;\n    '
                + 'const title = document.querySelector(\'title\').textContent;\n    '
                + 'log.info(`URL: ${request.url} TITLE: ${title}`);\n    return'
                + ' {\n        url: request.url,\n        title\n    };\n}',
            proxyConfiguration: { useApifyProxy: false },
            customData: {},
            initialCookies: [],
            useRequestQueue: true,
            injectUnderscore: false,
            injectJQuery: false,
            ignoreSslErrors: false,
            downloadMedia: false,
            downloadCss: false,
            debugLog: false,
            browserLog: false,
        };
        expect(prefillValues).to.be.eql(expected);
    });

    describe('createFieldsFromInputSchemaV1() works', () => {
        const validator = makeValidator(FieldSchema);
        const mockZ = { console: { log: () => {} } };

        it('for Web Scraper', () => {
            const fields = createFieldsFromInputSchemaV1(mockZ, webScraperInputSchemaJson, { title: 'Web Scraper' });
            fields.forEach((field) => {
                const test = validator.validate(field);
                expect(test.errors.length).to.be.eql(0);
            });
        });

        it('for Website Content Scraper', () => {
            const fields = createFieldsFromInputSchemaV1(mockZ, websiteContentCrawlerInputSchema, { title: 'Website Content Scraper' });
            fields.forEach((field) => {
                const test = validator.validate(field);
                expect(test.errors.length).to.be.eql(0);
            });
        });

        it('for Input Schema generated using GPT', () => {
            const fields = createFieldsFromInputSchemaV1(mockZ, generatedInputSchema, { title: 'Generated Input Schema' });
            fields.forEach((field) => {
                const test = validator.validate(field);
                expect(test.errors.length).to.be.eql(0);
            });
        });
    });

    describe('test request helper', () => {
        const appTester = zapier.createAppTester(App);

        const testToken = 'test-token';
        const testActorId = 'test-actor-id';

        afterEach(() => {
            nock.cleanAll();
        });

        // Run the trigger test with a mock request and matching of the headers
        it('should set headers correctly', async () => {
            const requestUrl = `https://example.com/#${randomString()}`;
            const bundle = {
                targetUrl: requestUrl,
                authData: {
                    access_token: testToken,
                },
                inputData: {
                    actorId: testActorId,
                },
                meta: {},
            };

            const scope = nock('https://api.apify.com')
                .post('/v2/webhooks')
                .matchHeader('Authorization', `Bearer ${testToken}`)
                .matchHeader('x-apify-integration-platform', 'zapier')
                .reply(201);

            await appTester(App.triggers.actorRunFinished.operation.performSubscribe, bundle);
            scope.done();
        });
    });
});

describe('createFieldsFromInputSchemaV1 e2e tests', () => {
    const validator = makeValidator(FieldSchema);

    // Actor IDs to test
    const actorIds = [
        'nwua9Gu5YrADL7ZDj',
        'aYG0l9s7dbB7j3gbS',
        'GdWCkxBtKWOsKjdch',
        '2APbAvDfNDOWXbkWf',
        'h7sDV53CddomktSi5',
        'shu8hvrXbJbY3Eb9W',
        '61RPP7dywgiy0JPD0',
        'KoJrdxJCTtpon81KY',
    ];

    // Create a mock z object that captures logs
    const createMockZ = () => {
        const logs = [];
        return {
            z: {
                console: {
                    log: (msg) => logs.push(msg),
                },
                request: async (options) => {
                    const url = typeof options === 'string' ? options : options.url;
                    const response = await fetch(url, {
                        headers: {
                            Authorization: `Bearer ${TEST_USER_TOKEN}`,
                        },
                    });
                    return { data: await response.json() };
                },
            },
            logs,
        };
    };

    before(function () {
        if (!TEST_USER_TOKEN) {
            console.log('Skipping e2e tests: TEST_USER_TOKEN not provided');
            this.skip();
        }
    });

    actorIds.forEach((actorId) => {
        it(`should generate valid fields for actor ${actorId}`, async function () {
            this.timeout(30000); // Allow more time for API calls

            const { z, logs } = createMockZ();

            // Fetch actor details
            const actorResponse = await z.request({
                url: `${APIFY_API_ENDPOINTS.actors}/${actorId}`,
            });
            const actor = actorResponse.data;

            // Get the input schema from the latest build
            const buildTag = 'latest';
            const inputSchema = await maybeGetInputSchemaFromActor(z, actor, buildTag);

            if (!inputSchema) {
                console.log(`  Actor ${actorId} (${actor.name}) has no input schema, skipping`);
                return;
            }

            // Generate fields
            const fields = createFieldsFromInputSchemaV1(z, inputSchema, actor);

            // Log any conversion errors that were caught
            if (logs.length > 0) {
                console.log(`  Conversion logs for ${actor.name}:`);
                logs.forEach((log) => console.log(`    ${log}`));
            }

            // Validate each field against Zapier's field schema
            expect(fields).to.be.an('array');
            expect(fields.length).to.be.greaterThan(0);

            const invalidFields = [];
            fields.forEach((field) => {
                const result = validator.validate(field);
                if (result.errors.length > 0) {
                    invalidFields.push({
                        field: field.key,
                        errors: result.errors,
                    });
                }
            });

            if (invalidFields.length > 0) {
                console.log(`  Invalid fields for ${actor.name}:`);
                invalidFields.forEach(({ field, errors }) => {
                    console.log(`    ${field}: ${JSON.stringify(errors)}`);
                });
            }

            expect(invalidFields.length, `Found ${invalidFields.length} invalid fields`).to.equal(0);
            console.log(`  ✓ Actor ${actor.name}: ${fields.length} fields generated successfully`);
        });
    });
});
