/* eslint-env mocha */
const { expect } = require('chai');
const zapier = require('zapier-platform-core');
const chai = require('chai');
const chaiAsPromised = require('chai-as-promised');
const nock = require('nock');
const { TEST_USER_TOKEN } = require('../helpers');
const App = require('../../index');
const { WEB_FETCH_STANDBY_URL } = require('../../src/consts');

const appTester = zapier.createAppTester(App);

chai.use(chaiAsPromised);

// The mocked tests assert on the Authorization header, so they need a token even when the suite
// runs without TEST_USER_TOKEN, i.e. in the default mocked mode.
const MOCKED_TOKEN = 'apify_api_mocked_token';

const getBundle = (inputData, token = MOCKED_TOKEN) => ({
    authData: {
        access_token: token,
    },
    inputData,
});

const getMockWebFetchResponse = () => ({
    url: 'https://www.example.com',
    fetch: {
        loadedUrl: 'https://www.example.com/',
        loadedTime: '2026-07-27T12:41:41.064Z',
        httpStatusCode: 200,
        contentLengthBytes: 1256,
        contentType: 'text/html; charset=utf-8',
    },
    metadata: {
        canonicalUrl: 'https://www.example.com/',
        title: 'Example Domain',
        description: null,
        author: null,
        keywords: null,
        languageCode: 'en',
        openGraph: [],
        jsonLd: null,
        headers: {
            'content-type': 'text/html; charset=utf-8',
        },
    },
    markdown: '## Example Domain\n\nThis domain is for use in illustrative examples in documents.',
});

describe('web fetch', () => {
    afterEach(async () => {
        nock.cleanAll();
    });

    it('fetches a URL and returns the Web Fetch envelope (mocked)', async () => {
        const mockResponse = getMockWebFetchResponse();
        let requestBody;

        const scope = nock(WEB_FETCH_STANDBY_URL, {
            reqheaders: {
                // The Standby Actor runs on its own host, so this also covers that the token and the
                // integration attribution header are attached outside of api.apify.com.
                authorization: `Bearer ${MOCKED_TOKEN}`,
                'x-apify-integration-platform': 'zapier',
            },
        })
            .post('/', (body) => {
                requestBody = body;
                return true;
            })
            .reply(200, mockResponse);

        const testResult = await appTester(App.creates.webFetch.operation.perform, getBundle({
            url: 'https://www.example.com',
            formats: ['markdown'],
        }));

        // The Actor input is sent as it is, there is no run to start and no dataset to read.
        expect(requestBody).to.eql({
            url: 'https://www.example.com',
            formats: ['markdown'],
        });
        // The envelope is passed through to the user untouched.
        expect(testResult).to.eql(mockResponse);
        expect(testResult.fetch.httpStatusCode).to.eql(200);
        expect(testResult.metadata.title).to.eql('Example Domain');

        scope.done();
    });

    it('sends a single selected format as an array and passes custom headers (mocked)', async () => {
        let requestBody;
        const scope = nock(WEB_FETCH_STANDBY_URL)
            .post('/', (body) => {
                requestBody = body;
                return true;
            })
            .reply(200, getMockWebFetchResponse());

        await appTester(App.creates.webFetch.operation.perform, getBundle({
            url: 'https://www.example.com',
            // Zapier sends a single selected value of a list field as a string.
            formats: 'markdown',
            headers: { 'Accept-Language': 'fr-FR' },
        }));

        expect(requestBody.formats).to.eql(['markdown']);
        expect(requestBody.headers).to.eql({ 'Accept-Language': 'fr-FR' });

        scope.done();
    });

    it('omits formats and headers from the input when they are not filled in (mocked)', async () => {
        let requestBody;
        const scope = nock(WEB_FETCH_STANDBY_URL)
            .post('/', (body) => {
                requestBody = body;
                return true;
            })
            .reply(200, getMockWebFetchResponse());

        await appTester(App.creates.webFetch.operation.perform, getBundle({
            url: 'https://www.example.com',
            // The note is a copy field, i.e. it only renders help text and must never be sent to the Actor.
            note: 'This action is designed to fetch the content of a single web page or file.',
        }));

        // Web Fetch picks a format based on the content type when formats is not sent at all.
        expect(requestBody).to.eql({ url: 'https://www.example.com' });

        scope.done();
    });

    it('returns null for a format that does not apply to the content, instead of failing (mocked)', async () => {
        const mockResponse = {
            url: 'https://www.example.com/image.png',
            fetch: {
                loadedUrl: 'https://www.example.com/image.png',
                httpStatusCode: 200,
                contentType: 'image/png',
            },
            metadata: {},
            markdown: null,
            links: null,
            raw: 'iVBORw0KGgoAAAANSUhEUg==',
        };
        const scope = nock(WEB_FETCH_STANDBY_URL)
            .post('/')
            .reply(200, mockResponse);

        const testResult = await appTester(App.creates.webFetch.operation.perform, getBundle({
            url: 'https://www.example.com/image.png',
            formats: ['markdown', 'links', 'raw'],
        }));

        expect(testResult.markdown).to.eql(null);
        expect(testResult.links).to.eql(null);
        expect(testResult.raw).to.eql(mockResponse.raw);

        scope.done();
    });

    it('surfaces the Web Fetch error message to the user (mocked)', async () => {
        const scope = nock(WEB_FETCH_STANDBY_URL)
            .post('/')
            .reply(415, {
                code: 'UNSUPPORTED_CONTENT_TYPE',
                error: 'Cannot convert content type application/zip to any of the requested formats.',
            });

        await expect(appTester(App.creates.webFetch.operation.perform, getBundle({
            url: 'https://www.example.com/archive.zip',
            formats: ['markdown'],
        }))).to.be.rejectedWith(/Cannot convert content type application\/zip/);

        scope.done();
    });

    it('does not retry an upstream fetch error and does not report it as an Apify API error (mocked)', async () => {
        let callCount = 0;
        // Web Fetch reports a failure of the target website with a 5xx status, which must not be
        // handled as a retryable Apify API error - Web Fetch already retries the fetch internally.
        nock(WEB_FETCH_STANDBY_URL)
            .post('/')
            .times(4)
            .reply(() => {
                callCount += 1;
                return [502, {
                    code: 'UPSTREAM_FETCH_ERROR',
                    error: 'The target URL could not be reached.',
                }];
            });

        await expect(appTester(App.creates.webFetch.operation.perform, getBundle({
            url: 'https://www.zz-this-page-doesn-not-exists-xx.com',
            formats: ['markdown'],
        }))).to.be.rejectedWith(/The target URL could not be reached/);

        expect(callCount).to.eql(1);
    });

    if (TEST_USER_TOKEN) {
        it('fetches a URL with correct output fields (E2E)', async () => {
            const bundle = getBundle({
                url: 'https://www.example.com',
                formats: ['markdown', 'links'],
            }, TEST_USER_TOKEN);

            const testResult = await appTester(App.creates.webFetch.operation.perform, bundle);

            expect(testResult.fetch.httpStatusCode).to.be.eql(200);
            expect(testResult.fetch.loadedUrl).to.be.a('string');
            expect(testResult.fetch.contentType).to.contain('text/html');
            expect(testResult.metadata.title).to.be.eql('Example Domain');
            expect(testResult.markdown).to.be.a('string');
            expect(testResult.markdown).to.contain('Example Domain');
            expect(testResult.links).to.be.an('array');
            // A format that was not requested is not part of the response.
            expect(testResult).to.not.have.property('html');
        }).timeout(60000);

        it('fails with a readable error for an invalid URL (E2E)', async () => {
            const bundle = getBundle({
                url: 'not-a-valid-url://example',
                formats: ['markdown'],
            }, TEST_USER_TOKEN);

            await expect(appTester(App.creates.webFetch.operation.perform, bundle)).to.be.rejected;
        }).timeout(60000);
    }
});
