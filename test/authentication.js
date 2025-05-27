/* eslint-env mocha */
const zapier = require('zapier-platform-core');
const { expect } = require('chai');
const nock = require('nock');
const { TEST_USER_TOKEN } = require('./helpers');

const App = require('../index');

const appTester = zapier.createAppTester(App);

describe('authentication', () => {
    afterEach(() => {
        if (!TEST_USER_TOKEN) {
            nock.cleanAll();
        }
    });

    it('passes authentication and returns user', async () => {
        const bundle = {
            authData: {
                access_token: TEST_USER_TOKEN,
            },
        };

        let scope;
        if (!TEST_USER_TOKEN) {
            scope = nock('https://api.apify.com')
                .get('/v2/users/me')
                .reply(200, {
                    username: 'testUser',
                });
        }

        const tester = await appTester(App.authentication.test, bundle);
        expect(tester).to.have.property('username');
        scope?.done();
    });

    it('throw user error if token is invalid', async () => {
        const bundle = {
            authData: {
                access_token: 'blabla',
            },
        };
        try {
            await appTester(App.authentication.test, bundle);
            throw new Error('Should failed');
        } catch (err) {
            expect(err.message).include('AuthenticationError');
        }
    });
});
