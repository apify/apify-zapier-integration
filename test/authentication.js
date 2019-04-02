const zapier = require('zapier-platform-core');
const { expect } = require('chai');

const App = require('../index');

const appTester = zapier.createAppTester(App);

// Injects all secrets from .env file
zapier.tools.env.inject();

describe('App.authentication.test', () => {
    it('passes authentication and returns json', async () => {
        const bundle = {
            authData: {
                token: process.env.TEST_USER_TOKEN,
            },
        };

        const tester = await appTester(App.authentication.test, bundle);
        expect(tester).to.have.property('username');
    });
});
