/* eslint-env mocha */
const zapier = require('zapier-platform-core');
const { expect } = require('chai');
const nock = require('nock');

const App = require('../../index');
const { TEST_USER_TOKEN } = require('../helpers');
const { parseAppError } = require('../helpers/server_actor');
const { SERVER_ACTORS_LIST_URL } = require('../../src/consts');

const appTester = zapier.createAppTester(App);
const { perform } = App.triggers.serverActors.operation;

const { origin: LIST_ORIGIN, pathname: LIST_PATH } = new URL(SERVER_ACTORS_LIST_URL);

// The snapshot record is shaped like GET /v2/store, but returns every item whatever limit and offset say.
const SNAPSHOT_ITEMS = Array.from({ length: 250 }, (_, i) => ({
    id: `serverActor${String(i).padStart(7, '0')}`,
    title: `Server Actor ${i}`,
    username: 'someone',
    name: `server-actor-${i}`,
}));

const mockSnapshot = (offset) => nock(LIST_ORIGIN)
    .get(LIST_PATH)
    .query({ limit: 100, offset })
    .reply(200, { data: { total: 250, count: 250, offset: 0, limit: 250, desc: false, items: SNAPSHOT_ITEMS } });

const getBundle = (page, token = 'apify_api_mocked_token') => ({ authData: { access_token: token }, inputData: {}, meta: { page } });

describe('server actors trigger', () => {
    afterEach(() => {
        nock.cleanAll();
    });

    it('returns the first 100 Server Actors with readable names (mocked)', async () => {
        const scope = mockSnapshot(0);

        const result = await appTester(perform, getBundle(0));

        expect(result).to.have.lengthOf(100);
        expect(result[0]).to.eql({ id: 'serverActor0000000', name: 'Server Actor 0 (someone/server-actor-0)' });
        expect(result[99].id).to.equal('serverActor0000099');
        scope.done();
    });

    it('pages through the snapshot locally (mocked)', async () => {
        const scopes = [mockSnapshot(100), mockSnapshot(200), mockSnapshot(300)];

        const pages = [
            await appTester(perform, getBundle(1)),
            await appTester(perform, getBundle(2)),
            await appTester(perform, getBundle(3)),
        ];

        expect(pages.map((page) => page.length)).to.eql([100, 50, 0]);
        expect(pages[0][0].id).to.equal('serverActor0000100');
        expect(pages[1][49].id).to.equal('serverActor0000249');
        scopes.forEach((scope) => scope.done());
    });

    it('fails with a clear error when the snapshot record is missing (mocked)', async () => {
        nock(LIST_ORIGIN)
            .get(LIST_PATH)
            .query(true)
            .reply(404, { error: { type: 'record-not-found', message: 'Record was not found' } });

        const error = await appTester(perform, getBundle(0)).then(() => {
            throw new Error('Expected the trigger to fail');
        }, parseAppError);

        expect(error).to.include({
            name: 'AppError',
            message: 'The list of Server Actors isn\'t available. Enter the Actor ID instead.',
            status: 404,
        });
    });

    if (TEST_USER_TOKEN) {
        // Reads the public snapshot record, which is free. No Server Actor is called. The API rejects an invalid token
        // even for a public record, so this needs the real one.
        it('reads the live snapshot record (E2E)', async () => {
            const result = await appTester(perform, getBundle(0, TEST_USER_TOKEN)).catch((err) => {
                throw new Error(`Reading ${SERVER_ACTORS_LIST_URL} failed: ${err.message}`);
            });

            expect(result).to.have.lengthOf(100);
            result.forEach(({ id, name }) => {
                expect(id).to.be.a('string').and.not.equal('');
                expect(name).to.be.a('string').and.not.equal('');
            });
        });
    }
});
