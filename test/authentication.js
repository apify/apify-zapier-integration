const zapier = require('zapier-platform-core');
const { expect } = require('chai');
const { TEST_USER_TOKEN } = require('./helpers');

const App = require('../index');

const appTester = zapier.createAppTester(App);

describe('authentication', () => {
    it('passes authentication and returns user', async () => {
        const bundle = {
            authData: {
                token: TEST_USER_TOKEN,
            },
        };

        const tester = await appTester(App.authentication.test, bundle);
        expect(tester).to.have.property('username');
    });

    it('throw user error if token is invalide', async () => {
        const bundle = {
            authData: {
                token: 'blabla',
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
