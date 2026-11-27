/* eslint-env mocha */
const zapier = require('zapier-platform-core');
const { expect } = require('chai');
const nock = require('nock');

const App = require('../../index');
const { TEST_USER_TOKEN } = require('../helpers');
const { APIFY_API_ENDPOINTS, SERVER_ACTOR_STORE_CATEGORIES } = require('../../src/consts');

const appTester = zapier.createAppTester(App);
const { perform } = App.triggers.serverActors.operation;

const { origin: STORE_ORIGIN, pathname: STORE_PATH } = new URL(APIFY_API_ENDPOINTS.store);

const TOTAL = 150;
const STORE_ITEMS = Array.from({ length: TOTAL }, (_, i) => ({
    id: `serverActor${String(i).padStart(7, '0')}`,
    title: `Server Actor ${i}`,
    username: 'someone',
    name: `server-actor-${i}`,
}));

// GET /v2/store pages itself, so each dropdown page is one request with its own offset.
const mockStorePage = (offset) => {
    const items = STORE_ITEMS.slice(offset, offset + 100);
    return nock(STORE_ORIGIN)
        .get(STORE_PATH)
        .query({ category: SERVER_ACTOR_STORE_CATEGORIES, limit: 100, offset, sortBy: 'popularity' })
        .reply(200, { data: { total: TOTAL, count: items.length, offset, limit: 100, desc: false, items } });
};

const getBundle = (page, token = 'apify_api_mocked_token') => ({ authData: { access_token: token }, inputData: {}, meta: { page } });

describe('server actors trigger', () => {
    afterEach(() => {
        nock.cleanAll();
    });

    it('lists the first 100 Server Actors from Apify Store with readable names (mocked)', async () => {
        const scope = mockStorePage(0);

        const result = await appTester(perform, getBundle(0));

        expect(result).to.have.lengthOf(100);
        expect(result[0]).to.eql({ id: 'serverActor0000000', name: 'Server Actor 0 (someone/server-actor-0)' });
        expect(result[99].id).to.equal('serverActor0000099');
        scope.done();
    });

    it('asks the Store API for the next page by offset (mocked)', async () => {
        const scopes = [mockStorePage(100), mockStorePage(200)];

        const pages = [
            await appTester(perform, getBundle(1)),
            await appTester(perform, getBundle(2)),
        ];

        expect(pages.map((page) => page.length)).to.eql([50, 0]);
        expect(pages[0][0].id).to.equal('serverActor0000100');
        expect(pages[0][49].id).to.equal('serverActor0000149');
        scopes.forEach((scope) => scope.done());
    });

    it('surfaces the API error when the Store rejects the request (mocked)', async () => {
        nock(STORE_ORIGIN)
            .get(STORE_PATH)
            .query(true)
            .reply(400, { error: { type: 'invalid-parameter', message: 'Parameter \'category\' contains an unknown category id' } });

        const error = await appTester(perform, getBundle(0)).then(() => {
            throw new Error('Expected the trigger to fail');
        }, (err) => err);

        expect(error.message).to.include('unknown category id');
    });

    if (TEST_USER_TOKEN) {
        // Lists Apify Store, which is free. No Server Actor is called.
        it('lists live Server Actors from Apify Store (E2E)', async () => {
            const result = await appTester(perform, getBundle(0, TEST_USER_TOKEN)).catch((err) => {
                throw new Error(`Listing Server Actors from ${APIFY_API_ENDPOINTS.store} failed: ${err.message}`);
            });

            expect(result).to.have.lengthOf(100);
            result.forEach(({ id, name }) => {
                expect(id).to.be.a('string').and.not.equal('');
                expect(name).to.be.a('string').and.not.equal('');
            });
        });
    }
});
