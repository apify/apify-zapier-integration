const { expect } = require('chai');
const { APIFY_API_ENDPOINTS } = require('../src/consts');

describe('consts', () => {
    it('APIFY_API_ENDPOINTS work', () => {
        // If test failed apify-client-js was changed
        expect(APIFY_API_ENDPOINTS.tasks).to.be.eql(`https://api.apify.com/v2/actor-tasks`);
        expect(APIFY_API_ENDPOINTS.webhooks).to.be.eql(`https://api.apify.com/v2/webhooks`);
    });
});
