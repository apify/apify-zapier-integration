/* eslint-env mocha */
const zapier = require('zapier-platform-core');
const { expect } = require('chai');
const nock = require('nock');
const { TEST_USER_TOKEN } = require('../helpers');

const App = require('../../index');
const { ACTOR_SAMPLE } = require('../../src/consts');

const appTester = zapier.createAppTester(App);

describe('search get actor details', () => {
    afterEach(async () => {
        if (!TEST_USER_TOKEN) {
            nock.cleanAll();
        }
    });

    it('returns empty array when actor not found', async () => {
        const bundle = {
            authData: {
                access_token: TEST_USER_TOKEN,
            },
            inputData: {
                actorId: 'non-existing-actor-id',
            },
        };

        let scope;
        if (!TEST_USER_TOKEN) {
            scope = nock('https://api.apify.com')
                .get('/v2/acts/non-existing-actor-id')
                .reply(404, {
                    error: {
                        type: 'record-not-found',
                        message: 'Actor was not found',
                    },
                });
        }

        const testResult = await appTester(App.searches.getActorDetails.operation.perform, bundle);

        expect(testResult.length).to.be.eql(0);

        scope?.done();
    });

    it('returns curated actor when found by ID', async () => {
        const bundle = {
            authData: {
                access_token: TEST_USER_TOKEN,
            },
            inputData: {
                actorId: TEST_USER_TOKEN ? 'apify/web-scraper' : ACTOR_SAMPLE.id,
            },
        };

        let scope;
        if (!TEST_USER_TOKEN) {
            scope = nock('https://api.apify.com')
                .get(`/v2/acts/${ACTOR_SAMPLE.id}`)
                .reply(200, {
                    // Extra fields (e.g. versions, userId) that must be dropped by the curation.
                    data: { ...ACTOR_SAMPLE, userId: 'wRsJZtadYvn4mBZmm', versions: [{ versionNumber: '0.1' }] },
                });
        }

        const testResult = await appTester(App.searches.getActorDetails.operation.perform, bundle);

        expect(testResult.length).to.be.eql(1);
        expect(testResult[0].id).to.be.a('string');
        expect(testResult[0].name).to.be.a('string');
        expect(testResult[0].username).to.be.a('string');
        // Non-curated fields must not leak through.
        expect(testResult[0].versions).to.be.eql(undefined);
        expect(testResult[0].userId).to.be.eql(undefined);

        scope?.done();
    });

    it('normalizes username/name slug to ~ in the request path', async () => {
        const bundle = {
            authData: {
                access_token: TEST_USER_TOKEN,
            },
            inputData: {
                actorId: 'apify/web-scraper',
            },
        };

        let scope;
        if (!TEST_USER_TOKEN) {
            scope = nock('https://api.apify.com')
                .get('/v2/acts/apify~web-scraper')
                .reply(200, {
                    data: { ...ACTOR_SAMPLE, name: 'web-scraper', username: 'apify' },
                });
        }

        const testResult = await appTester(App.searches.getActorDetails.operation.perform, bundle);

        expect(testResult.length).to.be.eql(1);
        expect(testResult[0].username).to.be.eql('apify');
        expect(testResult[0].name).to.be.eql('web-scraper');

        // In mocked mode a satisfied scope proves the `apify~web-scraper` path was hit.
        scope?.done();
    });
});
