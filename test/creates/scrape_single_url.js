/* eslint-env mocha */
const { expect } = require('chai');
const zapier = require('zapier-platform-core');
const chai = require('chai');
const chaiAsPromised = require('chai-as-promised');
const nock = require('nock');
const { TEST_USER_TOKEN, apifyClient, getMockRun } = require('../helpers');
const App = require('../../index');
const { SCRAPE_SINGLE_URL_RUN_SAMPLE } = require('../../src/consts');
const { waitForRunToFinish } = require('../../src/request_helpers');

const appTester = zapier.createAppTester(App);

chai.use(chaiAsPromised);

describe('scrape single URL', () => {
    afterEach(async () => {
        nock.cleanAll();
    });

    it('runs scrape single URL with correct output fields (mocked)', async () => {
        const options = {
            url: 'https://www.example.com',
            crawlerType: 'cheerio',
        };
        const bundle = {
            authData: {
                access_token: TEST_USER_TOKEN,
            },
            inputData: options,
        };

        const mockRun = getMockRun({
            actId: 'aYG0l9s7dbB7j3gbS',
            isStatusMessageTerminal: true,
            statusMessage: 'OK',
        });
        delete mockRun.OUTPUT;
        delete mockRun.datasetItems;
        delete mockRun.datasetItemsFileUrls;
        delete mockRun.consoleUrl;

        const mockDatasetItem = {
            url: 'https://www.example.com',
            metadata: {
                canonicalUrl: 'https://example.com/',
                title: 'Example Domain',
                description: null,
                author: null,
                keywords: null,
                languageCode: null,
            },
            html: '<html><head><title>Example Domain</title></head><body></body></html>',
            markdown: '# Example Domain\n\nThis domain is for use in illustrative examples in documents.',
            text: 'Example Domain\n\nThis domain is for use in illustrative examples in documents.',
        };
        const mockDatasetPublicUrl = {
            data: {
                consoleUrl: `https://console.apify.com/storage/datasets/${mockRun.defaultDatasetId}`,
                itemsPublicUrl: `https://api.apify.com/v2/datasets/${mockRun.defaultDatasetId}/items`,
                generalAccess: 'FOLLOW_USER_SETTING',
                urlSigningSecretKey: 'RzPjuWxnQp4LNBkHANZ7tq36B15GgO',
            },
        }

        const scope = nock('https://api.apify.com');
        scope.post(`/v2/acts/${mockRun.actId}/runs`, {
            startUrls: [{ url: options.url }],
            crawlerType: options.crawlerType,
            maxCrawlDepth: 0,
            maxCrawlPages: 1,
            maxResults: 1,
            proxyConfiguration: {
                useApifyProxy: true,
            },
            removeCookieWarnings: true,
            saveHtml: true,
            saveMarkdown: true,
        })
            .query({
                memory: 1024,
            })
            .reply(200, { data: mockRun });
        scope.get(`/v2/datasets/${mockRun.defaultDatasetId}/items`)
            .query({ limit: 1, clean: true })
            .reply(200, [mockDatasetItem]);
        scope.get(`/v2/datasets/${mockRun.defaultDatasetId}`)
            .reply(200, mockDatasetPublicUrl);
        scope.get(`/v2/actor-runs/${mockRun.id}`)
            .query({ waitForFinish: 60 })
            .reply(200, { data: mockRun });

        const testResult = await appTester(App.creates.scrapeSingleUrl.operation.perform, bundle);

        expect(testResult).to.have.all.keys(Object.keys(SCRAPE_SINGLE_URL_RUN_SAMPLE));
        expect(testResult.detailsPageUrl).to.eql(`https://console.apify.com/actors/${mockRun.actId}/runs/${mockRun.id}`);
        expect(testResult.pageUrl).to.eql('https://www.example.com');
        expect(testResult.pageMetadata).to.eql(mockDatasetItem.metadata);
        expect(testResult.pageContent).to.have.all.keys(['html', 'markdown', 'text']);
        expect(testResult.pageContent.html).to.eql(mockDatasetItem.html);
        expect(testResult.pageContent.markdown).to.equal(mockDatasetItem.markdown);
        expect(testResult.pageContent.text).to.equal(mockDatasetItem.text);

        scope.done();
    });

    if (TEST_USER_TOKEN) {
        it('runs scrape single URL with correct output fields (E2E)', async () => {
            const options = {
                url: 'https://www.example.com',
                crawlerType: 'cheerio',
            };
            const bundle = {
                authData: {
                    access_token: TEST_USER_TOKEN,
                },
                inputData: options,
            };

            const testResult = await appTester(App.creates.scrapeSingleUrl.operation.perform, bundle);
            const scrapeSingleUrlRun = await apifyClient.run(testResult.id).get();
            const datasetClient = await apifyClient.dataset(scrapeSingleUrlRun.defaultDatasetId);
            const datasetItems = await datasetClient.listItems({ limit: 1 });
            const kvsClient = await apifyClient.keyValueStore(scrapeSingleUrlRun.defaultKeyValueStoreId);
            const input = await kvsClient.getRecord('INPUT');

            const expectedKeys = [...Object.keys(SCRAPE_SINGLE_URL_RUN_SAMPLE), 'consoleUrl'];
            expect(testResult).to.have.all.keys(expectedKeys);
            expect(scrapeSingleUrlRun.status).to.be.eql('SUCCEEDED');
            // Run scraper just one single URL
            expect(datasetItems.items.length).to.be.eql(1);

            // Correctly set type of crawler
            expect(input.value.crawlerType).to.be.eql(options.crawlerType);

            // Check that output fields are correct
            const result = datasetItems.items[0];
            expect(testResult.pageUrl).to.be.eql(result.url);
            expect(testResult.pageContent).to.be.eql({
                html: result.html,
                markdown: result.markdown,
                text: result.text,
            });
            expect(testResult.pageMetadata).to.be.eql(result.metadata);
        }).timeout(60000);
    }

    it('throws if there are no data', async () => {
        const options = {
            url: 'https://www.zz-this-page-doesn-not-exists-xx.com',
            crawlerType: 'cheerio',
        };
        const bundle = {
            authData: {
                access_token: TEST_USER_TOKEN,
            },
            inputData: options,
        };

        let scope;
        if (!TEST_USER_TOKEN) {
            scope = nock('https://api.apify.com');
            scope.post('/v2/acts/aYG0l9s7dbB7j3gbS/runs', {
                startUrls: [{ url: options.url }],
                crawlerType: options.crawlerType,
                maxCrawlDepth: 0,
                maxCrawlPages: 1,
                maxResults: 1,
                proxyConfiguration: {
                    useApifyProxy: true,
                },
                removeCookieWarnings: true,
                saveHtml: true,
                saveMarkdown: true,
            })
                .query({
                    memory: 1024,
                })
                .reply(200, { data: SCRAPE_SINGLE_URL_RUN_SAMPLE });
            scope.get(`/v2/datasets/${SCRAPE_SINGLE_URL_RUN_SAMPLE.defaultDatasetId}/items`)
                .query({ limit: 1, clean: true })
                .reply(200, []);
            scope.get(`/v2/actor-runs/${SCRAPE_SINGLE_URL_RUN_SAMPLE.id}`)
                .query(true)
                .reply(200, { data: SCRAPE_SINGLE_URL_RUN_SAMPLE });
        }

        await expect(appTester(App.creates.scrapeSingleUrl.operation.perform, bundle)).to.be.rejectedWith(/page content is missing/);
        scope?.done();
    }).timeout(120_000);
});
