/* eslint-env mocha */
const _ = require('lodash');
const zapier = require('zapier-platform-core');
const chai = require('chai');
const chaiAsPromised = require('chai-as-promised');
const nock = require('nock');
const { TEST_USER_TOKEN } = require('../helpers');
const App = require('../../index');
const { WEB_FETCH_STANDBY_URL, WEB_FETCH_TIMEOUT_MILLIS, WEB_FETCH_SAMPLE } = require('../../src/consts');

const appTester = zapier.createAppTester(App);

chai.use(chaiAsPromised);
const { expect } = chai;

// The mocked tests assert on the Authorization header, so they need a token even when the suite
// runs without TEST_USER_TOKEN, i.e. in the default mocked mode.
const MOCKED_TOKEN = 'apify_api_mocked_token';

const getBundle = (inputData, token = MOCKED_TOKEN) => ({
    authData: {
        access_token: token,
    },
    inputData,
});

/**
 * The Actor returns the fixed part of the envelope plus the formats that were requested, so a mocked
 * response is the sample narrowed down to those formats. Deriving it from the sample keeps the mocks
 * and the sample that the Zap editor advertises from drifting apart.
 */
const getMockWebFetchResponse = (formats = ['markdown']) => _.pick(WEB_FETCH_SAMPLE, ['url', 'fetch', 'metadata', ...formats]);

/**
 * Mocks a single request to the Web Fetch Standby endpoint. getRequestBody() returns the Actor input
 * that the perform sent and getCallCount() how many times it was sent, which is what the retry
 * assertion needs.
 */
const mockWebFetch = ({ status = 200, body = getMockWebFetchResponse(), reqheaders, times = 1, delayMillis } = {}) => {
    let requestBody;
    let callCount = 0;

    let interceptor = nock(WEB_FETCH_STANDBY_URL, reqheaders && { reqheaders })
        .post('/', (sentBody) => {
            requestBody = sentBody;
            callCount += 1;
            return true;
        })
        .times(times);

    if (delayMillis) interceptor = interceptor.delayConnection(delayMillis);

    return {
        scope: interceptor.reply(status, body),
        getRequestBody: () => requestBody,
        getCallCount: () => callCount,
    };
};

const mockWebFetchError = (status, code, error, times) => mockWebFetch({ status, body: { code, error }, times });

describe('web fetch', () => {
    afterEach(async () => {
        nock.cleanAll();
    });

    it('fetches a URL and returns the Web Fetch envelope (mocked)', async () => {
        const mockResponse = getMockWebFetchResponse();
        const { scope, getRequestBody } = mockWebFetch({
            body: mockResponse,
            reqheaders: {
                // The Standby Actor runs on its own host, so this also covers that the token and the
                // integration attribution header are attached outside of api.apify.com.
                authorization: `Bearer ${MOCKED_TOKEN}`,
                'x-apify-integration-platform': 'zapier',
            },
        });

        const testResult = await appTester(App.creates.webFetch.operation.perform, getBundle({
            url: 'https://www.example.com',
            format_markdown: true,
        }));

        // The Actor input is sent as it is, there is no run to start and no dataset to read.
        expect(getRequestBody()).to.eql({
            url: 'https://www.example.com',
            formats: ['markdown'],
        });
        // The envelope is passed through to the user untouched.
        expect(testResult).to.eql(mockResponse);

        scope.done();
    });

    it('collects the ticked format checkboxes into an array and passes custom headers (mocked)', async () => {
        const { scope, getRequestBody } = mockWebFetch({ body: getMockWebFetchResponse(['markdown', 'links']) });

        await appTester(App.creates.webFetch.operation.perform, getBundle({
            url: 'https://www.example.com',
            format_markdown: true,
            format_links: true,
            // An unticked checkbox must not end up in the Actor input.
            format_html: false,
            headers: { 'Accept-Language': 'fr-FR' },
        }));

        expect(getRequestBody().formats).to.eql(['markdown', 'links']);
        expect(getRequestBody().headers).to.eql({ 'Accept-Language': 'fr-FR' });

        scope.done();
    });

    it('omits formats and headers from the input when they are not filled in (mocked)', async () => {
        const { scope, getRequestBody } = mockWebFetch();

        await appTester(App.creates.webFetch.operation.perform, getBundle({
            url: 'https://www.example.com',
            // The note is a copy field, i.e. it only renders help text and must never be sent to the Actor.
            note: 'This action is designed to fetch the content of a single web page or file.',
        }));

        // With no checkbox ticked, Web Fetch picks a format based on the content type.
        expect(getRequestBody()).to.eql({ url: 'https://www.example.com' });

        scope.done();
    });

    it('returns null for a format that does not apply to the content, instead of failing (mocked)', async () => {
        // Not derived from the sample on purpose, every format of the sample is filled in.
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
        const { scope } = mockWebFetch({ body: mockResponse });

        const testResult = await appTester(App.creates.webFetch.operation.perform, getBundle({
            url: 'https://www.example.com/image.png',
            format_markdown: true,
            format_links: true,
            format_raw: true,
        }));

        expect(testResult).to.eql(mockResponse);

        scope.done();
    });

    it('surfaces the Web Fetch error message to the user (mocked)', async () => {
        const { scope } = mockWebFetchError(
            415,
            'UNSUPPORTED_CONTENT_TYPE',
            'Cannot convert content type application/zip to any of the requested formats.',
        );

        await expect(appTester(App.creates.webFetch.operation.perform, getBundle({
            url: 'https://www.example.com/archive.zip',
            format_markdown: true,
        }))).to.be.rejectedWith(/Cannot convert content type application\/zip/);

        scope.done();
    });

    it('does not retry an upstream fetch error and does not report it as an Apify API error (mocked)', async () => {
        // Web Fetch reports a failure of the target website with a 5xx status, which must not be
        // handled as a retryable Apify API error - Web Fetch already retries the fetch internally.
        const { getCallCount } = mockWebFetchError(502, 'UPSTREAM_FETCH_ERROR', 'The target URL could not be reached.', 4);

        await expect(appTester(App.creates.webFetch.operation.perform, getBundle({
            url: 'https://www.zz-this-page-doesn-not-exists-xx.com',
            format_markdown: true,
        }))).to.be.rejectedWith(/The target URL could not be reached/);

        expect(getCallCount()).to.eql(1);
    });

    it('surfaces the Actor timeout message and does not replace it with the client-side one (mocked)', async () => {
        // The Actor allows 2 minutes per fetch and reports its own timeout as 504 FETCH_TIMEOUT.
        // That is a different failure from cutting the request off ourselves after
        // WEB_FETCH_TIMEOUT_MILLIS, so the Actor's message has to reach the user unchanged.
        const { scope } = mockWebFetchError(504, 'FETCH_TIMEOUT', 'The target website timed out after 120 seconds.');

        await expect(appTester(App.creates.webFetch.operation.perform, getBundle({
            url: 'https://www.example.com/slow',
            format_markdown: true,
        }))).to.be.rejectedWith(/The target website timed out after 120 seconds/);

        scope.done();
    });

    // This one waits out the full WEB_FETCH_TIMEOUT_MILLIS, because the timeout is enforced by the
    // request client and cannot be shortened from the test.
    it('reports a client-side timeout with the URL and the time limit (mocked)', async () => {
        // node-fetch surfaces our own timeout as a FetchError with no status, so it cannot be
        // handled in the response middleware with the other Web Fetch errors.
        mockWebFetch({ delayMillis: WEB_FETCH_TIMEOUT_MILLIS + 1000 });

        await expect(appTester(App.creates.webFetch.operation.perform, getBundle({
            url: 'https://www.example.com/slow',
            format_markdown: true,
        }))).to.be.rejectedWith(new RegExp(`took more than ${WEB_FETCH_TIMEOUT_MILLIS / 1000} seconds`));
    }).timeout(WEB_FETCH_TIMEOUT_MILLIS + 10000);

    if (TEST_USER_TOKEN) {
        it('fetches a URL with correct output fields (E2E)', async () => {
            const bundle = getBundle({
                url: 'https://www.example.com',
                format_markdown: true,
                format_links: true,
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
                format_markdown: true,
            }, TEST_USER_TOKEN);

            await expect(appTester(App.creates.webFetch.operation.perform, bundle)).to.be.rejected;
        }).timeout(60000);
    }
});
