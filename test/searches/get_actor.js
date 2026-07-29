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

    it('returns curated actor when found', async () => {
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
                    data: {
                        ...ACTOR_SAMPLE,
                        // Top-level and nested noise that the curation must drop.
                        userId: 'wRsJZtadYvn4mBZmm',
                        versions: [{ versionNumber: '0.1' }],
                        stats: { ...ACTOR_SAMPLE.stats, bookmarkCount: 1377, totalUsers7Days: 2 },
                        defaultRunOptions: { ...ACTOR_SAMPLE.defaultRunOptions, restartOnError: true },
                        taggedBuilds: {
                            latest: { buildId: 'z2EryhbfhgSyqj6Hn', buildNumber: '0.0.2', finishedAt: '2019-06-10T11:15:49.286Z', buildNumberInt: 2 },
                        },
                    },
                });
        }

        const testResult = await appTester(App.searches.getActorDetails.operation.perform, bundle);

        expect(testResult.length).to.be.eql(1);
        expect(testResult[0].id).to.be.a('string');
        expect(testResult[0].name).to.be.a('string');
        expect(testResult[0].username).to.be.a('string');
        // Curation must strip API noise (asserted in both mocked and E2E modes: the real
        // web-scraper response also carries stats.bookmarkCount and defaultRunOptions.restartOnError).
        expect(testResult[0].versions).to.be.eql(undefined);
        expect(testResult[0].userId).to.be.eql(undefined);
        expect(testResult[0].stats.bookmarkCount).to.be.eql(undefined);
        expect(testResult[0].defaultRunOptions.restartOnError).to.be.eql(undefined);
        // Exact curated shape is asserted against the deterministic mock.
        if (!TEST_USER_TOKEN) {
            expect(testResult[0].stats).to.have.keys(['totalRuns', 'totalUsers', 'lastRunStartedAt']);
            expect(testResult[0].defaultRunOptions).to.have.keys(['build', 'timeoutSecs', 'memoryMbytes']);
            expect(testResult[0].taggedBuilds.latest).to.have.keys(['buildId', 'buildNumber']);
        }

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
