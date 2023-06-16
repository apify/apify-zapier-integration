const { expect } = require('chai');
const { ACTOR_LIMITS: { MIN_RUN_MEMORY_MBYTES } } = require('@apify/consts');
const { APIFY_API_ENDPOINTS, ALLOWED_MEMORY_MBYTES_LIST } = require('../src/consts');

describe('consts', () => {
    it('APIFY_API_ENDPOINTS work', () => {
        // If test failed apify-client-js was changed
        expect(APIFY_API_ENDPOINTS.tasks).to.be.eql(`https://api.apify.com/v2/actor-tasks`);
        expect(APIFY_API_ENDPOINTS.webhooks).to.be.eql(`https://api.apify.com/v2/webhooks`);
    });

    it('ALLOWED_MEMORY_MBYTES_LIST work', () => {
        ALLOWED_MEMORY_MBYTES_LIST.forEach((mbytes, i) => {
            expect(mbytes).to.be.eql(MIN_RUN_MEMORY_MBYTES * (2 ** i));
        });
    });
});
