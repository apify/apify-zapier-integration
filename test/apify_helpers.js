const { expect } = require('chai');
const { getPrefilledValuesFromInputSchema } = require('../src/apify_helpers');
const webScraperInputSchemaJson = require('./helpers/webScraperInputSchema.json');

describe('apify utils', () => {
    it('getPrefilledValuesFromInputSchema work', () => {
        const prefillValues = getPrefilledValuesFromInputSchema(JSON.stringify(webScraperInputSchemaJson));
        const expected = {
            startUrls: [{ url: 'https://apify.com' }],
            pseudoUrls: [{ purl: 'https://apify.com[(/[\\w-]+)?]' }],
            linkSelector: 'a',
            pageFunction: 'async function pageFunction(context) {\n    const { request, log } = context;\n    '
                + 'const title = document.querySelector(\'title\').textContent;\n    '
                + 'log.info(`URL: ${request.url} TITLE: ${title}`);\n    return'
                + ' {\n        url: request.url,\n        title\n    };\n}',
            proxyConfiguration: { useApifyProxy: false },
            customData: {},
            initialCookies: [],
        };
        expect(prefillValues).to.be.eql(expected);
    });
});
