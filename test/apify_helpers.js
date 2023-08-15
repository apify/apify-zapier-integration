const { expect } = require('chai');
const FieldSchema = require('zapier-platform-schema/lib/schemas/FieldSchema');
const makeValidator = require('zapier-platform-schema/lib/utils/makeValidator');
const { getPrefilledValuesFromInputSchema, createFieldsFromInputSchemaV1 } = require('../src/apify_helpers');
const webScraperInputSchemaJson = require('./helpers/webScraperInputSchema.json');
const websiteContentCrawlerInputSchema = require('./helpers/websiteContentCrawlerInputSchema.json');
const generatedInputSchema = require('./helpers/generatedInputSchema.json');

describe('apify utils', () => {
    it('getPrefilledValuesFromInputSchema work', () => {
        const prefillValues = getPrefilledValuesFromInputSchema(webScraperInputSchemaJson);
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
            useRequestQueue: true,
            injectUnderscore: false,
            injectJQuery: false,
            ignoreSslErrors: false,
            downloadMedia: false,
            downloadCss: false,
            debugLog: false,
            browserLog: false,
        };
        expect(prefillValues).to.be.eql(expected);
    });

    describe('createFieldsFromInputSchemaV1() works', () => {
        const validator = makeValidator(FieldSchema);

        it('for Web Scraper', () => {
            const fields = createFieldsFromInputSchemaV1(webScraperInputSchemaJson, { title: 'Web Scraper' });
            fields.forEach((field) => {
                const test = validator.validate(field);
                expect(test.errors.length).to.be.eql(0);
            });
        });

        it('for Website Content Scraper', () => {
            const fields = createFieldsFromInputSchemaV1(websiteContentCrawlerInputSchema, { title: 'Website Content Scraper' });
            fields.forEach((field) => {
                const test = validator.validate(field);
                expect(test.errors.length).to.be.eql(0);
            });
        });

        it('for Input Schema generated using GPT', () => {
            const fields = createFieldsFromInputSchemaV1(generatedInputSchema, { title: 'Generated Input Schema' });
            fields.forEach((field) => {
                const test = validator.validate(field);
                expect(test.errors.length).to.be.eql(0);
            });
        });
    });
});
