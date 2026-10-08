/* eslint-env mocha */
const zapier = require('zapier-platform-core');
const { expect } = require('chai');
const nock = require('nock');
const { TEST_USER_TOKEN } = require('../helpers');

const App = require('../../index');

const appTester = zapier.createAppTester(App);

// A realistic pair of store items, including nested `stats` and extra fields that curation must drop.
const STORE_ITEMS = [
    {
        id: 'LpVuK3Zozwuipa5bp',
        name: 'linkedin-profile-scraper',
        title: 'LinkedIn Profile Scraper',
        description: 'Extract detailed information from LinkedIn profiles in bulk.',
        username: 'harvestapi',
        url: 'https://apify.com/harvestapi/linkedin-profile-scraper',
        categories: ['LEAD_GENERATION', 'SOCIAL_MEDIA'],
        stats: {
            totalBuilds: 126,
            totalRuns: 16075561,
            totalUsers: 48054,
            lastRunStartedAt: '2026-07-10T09:41:39.937Z',
        },
        // Non-curated fields that must not leak through.
        pictureUrl: 'https://example.com/pic.webp',
        currentPricingInfo: { pricingModel: 'PAY_PER_EVENT' },
    },
    {
        id: 'dev0FusionActorId',
        name: 'Linkedin-Profile-Scraper',
        title: 'Mass Linkedin Profile Scraper',
        description: 'Scrape LinkedIn profiles at scale.',
        username: 'dev_fusion',
        url: 'https://apify.com/dev_fusion/Linkedin-Profile-Scraper',
        categories: ['LEAD_GENERATION'],
        stats: {
            totalBuilds: 130,
            totalRuns: 22069898,
            totalUsers: 61620,
            lastRunStartedAt: '2026-07-10T09:38:39.019Z',
        },
    },
];

describe('search apify store', () => {
    afterEach(async () => {
        if (!TEST_USER_TOKEN) {
            nock.cleanAll();
        }
    });

    it('returns a curated array of actors when results are found', async () => {
        const bundle = {
            authData: {
                access_token: TEST_USER_TOKEN,
            },
            inputData: {
                query: 'linkedin scraper',
                limit: 2,
            },
        };

        let scope;
        if (!TEST_USER_TOKEN) {
            scope = nock('https://api.apify.com')
                .get('/v2/store')
                .query({ search: 'linkedin scraper', limit: 2 })
                .reply(200, {
                    data: {
                        total: 4624,
                        count: 2,
                        offset: 0,
                        limit: 2,
                        items: STORE_ITEMS,
                    },
                });
        }

        const testResult = await appTester(App.searches.searchApifyStore.operation.perform, bundle);

        expect(testResult).to.be.an('array');
        expect(testResult.length).to.be.at.least(1);

        const [actor] = testResult;
        expect(actor.id).to.be.a('string');
        expect(actor.name).to.be.a('string');
        expect(actor.username).to.be.a('string');
        expect(actor.stats__totalRuns).to.be.a('number');
        // Non-curated fields must not leak through.
        expect(actor.pictureUrl).to.be.eql(undefined);
        expect(actor.currentPricingInfo).to.be.eql(undefined);
        expect(actor.stats).to.be.eql(undefined);

        if (!TEST_USER_TOKEN) {
            expect(testResult.length).to.be.eql(2);
            expect(actor.stats__totalRuns).to.be.eql(16075561);
            expect(actor.stats__totalUsers).to.be.eql(48054);
        }

        scope?.done();
    });

    it('sends search, limit and offset as query params', async () => {
        const bundle = {
            authData: {
                access_token: TEST_USER_TOKEN,
            },
            inputData: {
                query: 'google maps',
                limit: 5,
                offset: 10,
            },
        };

        let scope;
        if (!TEST_USER_TOKEN) {
            // A satisfied scope with this exact query proves the params were sent correctly.
            scope = nock('https://api.apify.com')
                .get('/v2/store')
                .query({ search: 'google maps', limit: 5, offset: 10 })
                .reply(200, {
                    data: {
                        total: 0,
                        count: 0,
                        offset: 10,
                        limit: 5,
                        items: [],
                    },
                });
        }

        const testResult = await appTester(App.searches.searchApifyStore.operation.perform, bundle);

        expect(testResult).to.be.an('array');

        scope?.done();
    });

    it('returns an empty array when no actors match', async () => {
        const bundle = {
            authData: {
                access_token: TEST_USER_TOKEN,
            },
            inputData: {
                query: 'zzzznomatchqwerty12345',
                limit: 5,
            },
        };

        let scope;
        if (!TEST_USER_TOKEN) {
            scope = nock('https://api.apify.com')
                .get('/v2/store')
                .query({ search: 'zzzznomatchqwerty12345', limit: 5 })
                .reply(200, {
                    data: {
                        total: 0,
                        count: 0,
                        offset: 0,
                        limit: 5,
                        items: [],
                    },
                });
        }

        const testResult = await appTester(App.searches.searchApifyStore.operation.perform, bundle);

        expect(testResult).to.be.an('array');
        expect(testResult.length).to.be.eql(0);

        scope?.done();
    });
});
