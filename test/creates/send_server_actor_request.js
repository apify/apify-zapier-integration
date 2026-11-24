/* eslint-env mocha */
const zapier = require('zapier-platform-core');
const { expect } = require('chai');
const nock = require('nock');
const FieldSchema = require('zapier-platform-schema/lib/schemas/PlainInputFieldSchema');
const makeValidator = require('zapier-platform-schema/lib/utils/makeValidator');

const App = require('../../index');
const { requestTiming } = require('../../src/server_actor');
const { SERVER_ACTOR_STEP_BUDGET_MILLIS, SERVER_ACTOR_MIN_REQUEST_MILLIS } = require('../../src/consts');
const {
    ITEMS_OPENAPI,
    MOCKED_TOKEN,
    WEB_FETCH_ACTOR_ID,
    WEB_FETCH_OPENAPI,
    WEB_FETCH_ORIGIN,
    getBundle,
    getMockServerActor,
    mockActorLookup,
    mockServerActor,
    parseAppError,
} = require('../helpers/server_actor');

const appTester = zapier.createAppTester(App);
const validator = makeValidator(FieldSchema);

const create = App.creates.sendServerActorRequest;
const { perform, inputFields } = create.operation;

const getInputFields = async (inputData) => {
    const fields = await appTester(inputFields, getBundle(inputData));
    // The static Actor field comes first, the rest is what the current state needs.
    expect(fields[0].key).to.equal('actorId');
    fields.forEach((field) => {
        const { errors } = validator.validate(field);
        expect(errors, `${field.key}: ${errors.map(String).join(', ')}`).to.have.lengthOf(0);
    });
    return fields.slice(1);
};

const getKeys = (fields) => fields.map(({ key }) => key);

/** Runs the step and returns the parts of the error it fails with. */
const performAndGetError = async (inputData) => {
    try {
        await appTester(perform, getBundle(inputData));
    } catch (err) {
        return parseAppError(err);
    }
    throw new Error('Expected the step to fail');
};

// What the error and response tests send. Their mocked Actor answers any query.
const SIMPLE_REQUEST = { endpoint: 'GET /', customQuery: { url: 'https://example.com' } };

// A message must never suggest sending a possibly charged request again.
const expectNoRetryAdvice = ({ message }) => expect(message).to.not.match(/try again|retry|later/i);

describe('send server actor request', () => {
    before(() => {
        // Nothing may reach a real Server Actor: each request costs money. Unmocked requests fail instead.
        nock.disableNetConnect();
    });

    afterEach(() => {
        nock.cleanAll();
        requestTiming.stepBudgetMillis = SERVER_ACTOR_STEP_BUDGET_MILLIS;
        requestTiming.minRequestMillis = SERVER_ACTOR_MIN_REQUEST_MILLIS;
    });

    after(() => {
        nock.enableNetConnect();
    });

    describe('input fields', () => {
        it('asks for an Actor first, and offers only Custom path until there is one, without any request', async () => {
            const fields = await getInputFields({ actorId: '' });

            expect(getKeys(fields)).to.eql(['serverActorNotice', 'endpoint']);
            expect(fields[0].helpText).to.equal('Select a Server Actor to see its endpoints. '
                + 'An Actor mapped from an earlier step can only use **Custom path**.');
            expect(fields[1].choices.map(({ value }) => value)).to.eql(['__custom__']);
            expect(fields[1].dependsOn).to.eql(['actorId']);
        });

        it('shows the Custom path fields when the editor passes no Actor, as it does for a mapped one', async () => {
            // While the editor loads fields, a mapped Actor is missing from inputData, and inputDataRaw is empty.
            const fields = await getInputFields({ actorId: undefined, endpoint: '__custom__' });

            expect(getKeys(fields)).to.eql(['serverActorNotice', 'endpoint', 'customMethod', 'customPath', 'customQuery', 'customBody']);
        });

        it('explains what to enter for "." or ".." without looking the Actor up', async () => {
            // Nothing is mocked and net connect is off, so a lookup would show "Couldn't load the Actor's endpoints" instead.
            for (const actorId of ['.', '..']) {
                const fields = await getInputFields({ actorId });
                expect(fields.map(({ helpText }) => helpText), actorId).to.eql(['Enter the Actor as an ID or as username~name, e.g. apify~web-fetch.']);
            }
        });

        it('lists the documented endpoints and Custom path, and resets the endpoint when the Actor changes', async () => {
            const scope = mockActorLookup();

            const fields = await getInputFields({});

            expect(getKeys(fields)).to.eql(['endpoint']);
            const [endpointField] = fields;
            expect(endpointField).to.include({ required: true, altersDynamicFields: true });
            expect(endpointField.dependsOn).to.eql(['actorId']);
            expect(endpointField.choices).to.eql([
                { value: 'GET /', label: 'GET / - Fetch a URL', sample: 'GET /' },
                { value: 'POST /', label: 'POST / - Fetch a URL', sample: 'POST /' },
                { value: '__custom__', label: 'Custom path', sample: '__custom__' },
            ]);
            expect(scope.isDone()).to.equal(true);
        });

        it('reads an OpenAPI document that the build returns as a JSON string', async () => {
            mockActorLookup({ actorDefinition: { webServerSchema: JSON.stringify(WEB_FETCH_OPENAPI) } });

            const [endpointField] = await getInputFields({});

            expect(endpointField.choices.map(({ value }) => value)).to.eql(['GET /', 'POST /', '__custom__']);
        });

        it('adds the endpoint\'s query parameters, and its body except for GET', async () => {
            mockActorLookup();
            const getFields = await getInputFields({ endpoint: 'GET /' });
            mockActorLookup();
            const postFields = await getInputFields({ endpoint: 'POST /' });

            expect(getKeys(getFields)).to.eql(['endpoint', 'customQuery']);
            expect(getFields[1].helpText).to.equal('The endpoint\'s query parameters, and the values of path placeholders such as `{itemId}`.');
            expect(getKeys(postFields)).to.eql(['endpoint', 'customQuery', 'customBody']);
        });

        it('adds the Custom path fields', async () => {
            mockActorLookup();

            const fields = await getInputFields({ endpoint: '__custom__' });

            expect(getKeys(fields)).to.eql(['endpoint', 'customMethod', 'customPath', 'customQuery', 'customBody']);
        });

        it('offers only Custom path and links the README when the Actor documents no endpoints', async () => {
            mockActorLookup({ actorDefinition: {} });

            const fields = await getInputFields({});

            expect(getKeys(fields)).to.eql(['serverActorNotice', 'endpoint']);
            expect(fields[0].helpText).to.include(`(https://console.apify.com/actors/${WEB_FETCH_ACTOR_ID}/information/latest/readme)`);
            expect(fields[1].choices.map(({ value }) => value)).to.eql(['__custom__']);
        });

        it('shows only a message for an Actor without a server interface', async () => {
            const scope = mockActorLookup({ actor: getMockServerActor({ actorStandby: { isEnabled: false } }), withBuild: false });

            const fields = await getInputFields({});

            expect(fields).to.have.lengthOf(1);
            expect(fields[0].helpText).to.equal('This Actor has no server interface. Use **Run Actor** to start a run instead.');
            expect(scope.isDone()).to.equal(true);
        });

        it('shows only a message for an MCP-only Actor, with no endpoint list and no Custom path', async () => {
            mockActorLookup({ actorDefinition: { webServerMcpPath: '/mcp' } });
            const withoutOpenApi = await getInputFields({});
            mockActorLookup({ actorDefinition: { webServerMcpPath: '/mcp', webServerSchema: { paths: { '/mcp': { post: {} } } } } });
            const withMcpPathOnly = await getInputFields({ endpoint: '__custom__' });

            [withoutOpenApi, withMcpPathOnly].forEach((fields) => {
                expect(getKeys(fields)).to.eql(['serverActorNotice']);
                expect(fields[0].helpText).to.match(/^This Actor is an MCP server for AI assistants/);
            });
        });

        it('shows the not-found message for an Actor the account can\'t access', async () => {
            nock('https://api.apify.com')
                .get('/v2/acts/someone~private-actor')
                .reply(404, { error: { type: 'record-not-found', message: 'Actor was not found' } });

            const fields = await getInputFields({ actorId: 'someone~private-actor' });

            expect(fields).to.have.lengthOf(1);
            expect(fields[0].helpText).to.match(/^Actor "someone~private-actor" was not found or your Apify account cannot access it\./);
        });

        it('flags a saved endpoint that the Actor no longer has', async () => {
            mockActorLookup();

            const fields = await getInputFields({ endpoint: 'POST /search_[x]' });

            expect(getKeys(fields)).to.eql(['endpoint', 'endpointNotice']);
            expect(fields[1].helpText).to.equal('The endpoint "POST /search\\_\\[x\\]" isn\'t in this Actor\'s OpenAPI definition. '
                + 'Choose the endpoint again, or use **Custom path**.');
        });

        it('shows why the endpoints could not be loaded', async () => {
            nock('https://api.apify.com')
                .get(`/v2/acts/${WEB_FETCH_ACTOR_ID}`)
                .reply(200, { data: getMockServerActor() })
                .get(`/v2/acts/${WEB_FETCH_ACTOR_ID}/builds/default`)
                .reply(403, { error: { type: 'insufficient-permissions', message: 'You do not have permission' } });

            const fields = await getInputFields({});

            expect(fields).to.eql([{
                key: 'serverActorNotice',
                label: 'Server Actor',
                type: 'copy',
                helpText: 'Couldn\'t load the Actor\'s endpoints: You do not have permission',
            }]);
        });

        it('shows the message of an Apify API error that is a z.errors.Error, not its JSON', async () => {
            nock('https://api.apify.com')
                .get(`/v2/acts/${WEB_FETCH_ACTOR_ID}`)
                .reply(401, { error: { type: 'token-not-found', message: 'User was not found or authentication token is not valid' } });

            const [notice] = await getInputFields({});

            expect(notice.helpText).to.equal('Couldn\'t load the Actor\'s endpoints: User was not found or authentication token is not valid');
        });
    });

    describe('request', () => {
        it('sends a documented endpoint\'s request to the Actor\'s server with the token and returns the response', async () => {
            const apiScope = mockActorLookup();
            const responseBody = { url: 'https://example.com', markdown: '# Example' };
            const actor = mockServerActor({ body: responseBody });

            const result = await appTester(perform, getBundle({
                endpoint: 'GET /',
                customQuery: { url: 'https://example.com/?a=1&b=2', formats: 'markdown,links' },
                // A GET sends no body.
                customBody: '{"url":"https://other.example.com"}',
            }));

            expect(result).to.eql({ status: 200, contentType: 'application/json', body: responseBody });
            expect(actor.getCallCount()).to.equal(1);
            const [{ url, headers, body }] = actor.requests;
            expect(url.searchParams.get('url')).to.equal('https://example.com/?a=1&b=2');
            expect(url.searchParams.get('formats')).to.equal('markdown,links');
            expect(body).to.equal('');
            expect(headers.authorization).to.equal(`Bearer ${MOCKED_TOKEN}`);
            expect(headers['x-apify-integration-platform']).to.equal('zapier');
            expect(apiScope.isDone()).to.equal(true);
            expect(actor.scope.isDone()).to.equal(true);
        });

        it('fills path placeholders from the query parameters and sends the JSON body', async () => {
            mockActorLookup({ actorDefinition: { webServerSchema: ITEMS_OPENAPI } });
            const actor = mockServerActor({ method: 'POST', path: '/items/a%2Fb%20c' });

            await appTester(perform, getBundle({
                endpoint: 'POST /items/{itemId}',
                customQuery: { itemId: 'a/b c', limit: '5' },
                customBody: '{"name":"Lamp"}',
            }));

            const [{ url, body }] = actor.requests;
            expect(url.search).to.equal('?limit=5');
            expect(body).to.eql({ name: 'Lamp' });
        });

        it('uses the endpoint\'s method and path, not the ones left over from Custom path', async () => {
            mockActorLookup();
            const actor = mockServerActor();

            await appTester(perform, getBundle({ ...SIMPLE_REQUEST, customMethod: 'DELETE', customPath: '/admin' }));

            const [{ url }] = actor.requests;
            expect(`${url.pathname}${url.search}`).to.equal('/?url=https%3A%2F%2Fexample.com');
        });

        it('sends a Custom path request with its query after the one in the path', async () => {
            mockActorLookup();
            const actor = mockServerActor({ method: 'POST', path: '/search' });

            await appTester(perform, getBundle({
                endpoint: '__custom__',
                customMethod: 'post',
                customPath: 'search?lang=en',
                customQuery: { q: 'red lamps', '': 'blank row' },
                customBody: '{"limit":2}',
            }));

            const [{ url, body }] = actor.requests;
            expect([...url.searchParams]).to.eql([['lang', 'en'], ['q', 'red lamps']]);
            expect(body).to.eql({ limit: 2 });
        });

        it('sends a Custom path GET without a body', async () => {
            mockActorLookup();
            const actor = mockServerActor({ path: '/status' });

            await appTester(perform, getBundle({ endpoint: '__custom__', customMethod: 'GET', customPath: '/status', customBody: '{"a":1}' }));

            expect(actor.requests[0].body).to.equal('');
            expect(actor.requests[0].headers).to.not.have.property('content-type');
        });

        it('refuses a Custom path that names another host, without sending anything', async () => {
            const actor = mockServerActor({ path: '/other.example.com/steal' });

            await Promise.all(['//other.example.com/steal', 'https://other.example.com/steal'].map(async (customPath) => {
                mockActorLookup();
                const error = await performAndGetError({ endpoint: '__custom__', customMethod: 'GET', customPath });
                expect(error).to.include({ name: 'AppError', code: 'InvalidInput', status: 400 });
                expect(error.message).to.include('must be a path on the Actor\'s server');
            }));

            expect(actor.getCallCount()).to.equal(0);
        });

        it('refuses invalid values before sending anything', async () => {
            const actor = mockServerActor({ method: 'POST', path: '/' });

            mockActorLookup();
            const error = await performAndGetError({ endpoint: '__custom__', customMethod: 'POST', customPath: '/', customBody: '"text"' });
            expect(error.message).to.equal('"Body (JSON)" must be a JSON object or array.');

            expect(actor.getCallCount()).to.equal(0);
        });

        it('refuses a path parameter of "." or "..", which would send the request to another endpoint', async () => {
            // `/items/..` resolves to `/`, and `/items/.` to `/items/`.
            const otherEndpoints = [mockServerActor({ method: 'POST', path: '/' }), mockServerActor({ method: 'POST', path: '/items/' })];

            await Promise.all(['..', '.'].map(async (itemId) => {
                mockActorLookup({ actorDefinition: { webServerSchema: ITEMS_OPENAPI } });
                const error = await performAndGetError({ endpoint: 'POST /items/{itemId}', customQuery: { itemId } });
                expect(error).to.include({ code: 'InvalidInput', message: `The path parameter "itemId" can't be "${itemId}".` });
            }));

            otherEndpoints.forEach((endpoint) => expect(endpoint.getCallCount()).to.equal(0));
        });

        it('asks for a path parameter that isn\'t in the query parameters', async () => {
            mockActorLookup({ actorDefinition: { webServerSchema: ITEMS_OPENAPI } });

            const error = await performAndGetError({ endpoint: 'POST /items/{itemId}', customQuery: { limit: '5' } });

            expect(error).to.include({ code: 'InvalidInput', message: 'Add the path parameter "itemId" to Query parameters.' });
        });

        it('fails without an endpoint before looking anything up', async () => {
            const error = await performAndGetError({ endpoint: '' });
            expect(error).to.include({ message: 'Choose an endpoint.', code: 'InvalidInput' });
        });

        it('refuses "." and ".." as the Actor before any request, as /v2/acts/.. would be /v2/', async () => {
            // Nothing is mocked and net connect is off, so any request would fail with a different error.
            for (const actorId of ['.', '..', ' .. ', 'apify/web-fetch/..']) {
                const error = await performAndGetError({ actorId, endpoint: '__custom__', customPath: '/' });
                expect(error, actorId).to.include({ code: 'InvalidInput', message: 'Enter the Actor as an ID or as username~name, e.g. apify~web-fetch.' });
            }
        });

        it('refuses an endpoint that is not in the Actor\'s current OpenAPI definition', async () => {
            const actor = mockServerActor({ method: 'POST', path: '/items/1' });
            mockActorLookup();

            const error = await performAndGetError({ endpoint: 'POST /items/{itemId}', customQuery: { itemId: '1' } });

            expect(error.message).to.equal('The endpoint "POST /items/{itemId}" isn\'t in this Actor\'s OpenAPI definition. '
                + 'Choose the endpoint again, or use Custom path.');
            expect(actor.getCallCount()).to.equal(0);
        });

        it('refuses an Actor without a server interface, an MCP-only Actor and an unknown Actor without sending anything', async () => {
            const actor = mockServerActor();

            mockActorLookup({ actor: getMockServerActor({ actorStandby: { isEnabled: false } }), withBuild: false });
            const noServer = await performAndGetError({ endpoint: '__custom__', customPath: '/' });
            expect(noServer.message).to.equal('This Actor has no server interface. Use Run Actor to start a run instead.');

            // A standby URL outside *.apify.actor would receive the token, so it doesn't count as a server interface.
            mockActorLookup({ actor: getMockServerActor({ standbyUrl: 'https://web-fetch.example.com' }), withBuild: false });
            const foreignHost = await performAndGetError({ endpoint: '__custom__', customPath: '/' });
            expect(foreignHost.message).to.equal(noServer.message);

            mockActorLookup({ actorDefinition: { webServerMcpPath: '/mcp' } });
            const mcpOnly = await performAndGetError({ endpoint: '__custom__', customPath: '/mcp' });
            expect(mcpOnly.message).to.match(/^This Actor is an MCP server for AI assistants/);

            nock('https://api.apify.com').get('/v2/acts/nobody~nothing').reply(404, { error: { message: 'Actor was not found' } });
            const notFound = await performAndGetError({ actorId: 'nobody~nothing', endpoint: '__custom__', customPath: '/' });
            expect(notFound).to.include({ code: 'NotFound', status: 404 });
            expect(notFound.message).to.match(/^Actor "nobody~nothing" was not found/);

            expect(actor.getCallCount()).to.equal(0);
        });

        describe('errors and charging', () => {
            it('sends the request once on a 429 and leaves the status out of the error', async () => {
                mockActorLookup();
                const actor = mockServerActor({
                    status: 429,
                    body: { error: { type: 'rate-limit-exceeded', message: 'Too many requests' } },
                    headers: { 'Content-Type': 'application/json' },
                });

                const error = await performAndGetError(SIMPLE_REQUEST);

                // Zapier could read an error with status 429 as throttling and run the step again, sending a paid request twice.
                expect(error).to.include({ name: 'AppError', message: 'The Actor answered with status 429: Too many requests.' });
                expect(error).to.not.have.property('status');
                expectNoRetryAdvice(error);
                expect(actor.getCallCount()).to.equal(1);
                expect(actor.scope.isDone()).to.equal(true);
            });

            [
                [500, { error: 'Something broke', code: 'INTERNAL' }, 'The Actor answered with status 500: Something broke. '
                    + 'The request may still have been charged.'],
                [503, 'Service Unavailable', 'The Actor answered with status 503: Service Unavailable. The request may still have been charged.'],
                [400, { detail: 'url is required' }, 'The Actor answered with status 400: url is required.'],
            ].forEach(([status, body, message]) => {
                it(`sends the request once on a ${status} and shows the Actor's message`, async () => {
                    mockActorLookup();
                    const actor = mockServerActor({
                        status,
                        body,
                        headers: { 'Content-Type': typeof body === 'string' ? 'text/plain' : 'application/json' },
                    });

                    const error = await performAndGetError(SIMPLE_REQUEST);

                    // A z.errors.Error: not core's ThrottledError (retried about every 65 s) and not a RetryableError.
                    expect(error).to.include({ name: 'AppError', message, status });
                    expectNoRetryAdvice(error);
                    expect(actor.getCallCount()).to.equal(1);
                    expect(actor.scope.isDone()).to.equal(true);
                });
            });

            it('shows the title of an HTML error page instead of its markup', async () => {
                mockActorLookup();
                mockServerActor({
                    status: 404,
                    body: '<!DOCTYPE html><html><head><title>Page not found | Apify</title><script src="/a.js"></script></head></html>',
                    headers: { 'Content-Type': 'text/html; charset=utf-8' },
                });

                const error = await performAndGetError(SIMPLE_REQUEST);

                expect(error).to.include({ message: 'The Actor answered with status 404: Page not found | Apify.', status: 404 });
            });

            it('says the status when the Actor sends no message', async () => {
                mockActorLookup();
                mockServerActor({ status: 502, body: '', headers: {} });

                const error = await performAndGetError(SIMPLE_REQUEST);

                expect(error).to.include({
                    message: 'The Actor answered with status 502. The request may still have been charged.',
                    code: 'ServerActorError',
                });
            });

            it('reports a 504 as a timeout, with the Actor\'s message', async () => {
                mockActorLookup();
                const actor = mockServerActor({ status: 504, body: { error: 'Fetching the page timed out', code: 'FETCH_TIMEOUT' } });

                const error = await performAndGetError(SIMPLE_REQUEST);

                expect(error).to.include({
                    message: 'The Actor didn\'t answer in time. The request may still have been charged. '
                        + 'Status 504: Fetching the page timed out.',
                    code: 'FETCH_TIMEOUT',
                    status: 504,
                });
                expect(actor.getCallCount()).to.equal(1);
            });

            it('reports a 401 as an authentication error', async () => {
                mockActorLookup();
                mockServerActor({ status: 401, body: { error: { type: 'api-token-missing', message: 'API token is missing' } } });

                const error = await performAndGetError(SIMPLE_REQUEST);

                expect(error).to.include({ code: 'AuthenticationError', status: 401, message: 'The Actor answered with status 401: API token is missing.' });
            });

            it('returns a redirect instead of following it', async () => {
                mockActorLookup();
                const actor = mockServerActor({ status: 302, body: '', headers: { Location: 'https://other.example.com/steal' } });
                const elsewhere = nock('https://other.example.com').get('/steal').reply(200, 'stolen').persist();

                const result = await appTester(perform, getBundle(SIMPLE_REQUEST));

                expect(result).to.eql({ status: 302, contentType: null, body: null });
                expect(actor.getCallCount()).to.equal(1);
                expect(elsewhere.isDone()).to.equal(false);
            });

            it('halts the step when the Actor doesn\'t answer in time', async () => {
                requestTiming.stepBudgetMillis = 1000;
                requestTiming.minRequestMillis = 100;
                mockActorLookup();
                const actor = mockServerActor({ delayConnectionMillis: 3000 });

                const error = await performAndGetError(SIMPLE_REQUEST);

                // HaltedError is the only error Autoreplay never replays.
                expect(error.name).to.equal('HaltedError');
                // Core appends a "What happened" context to the message.
                expect(error.message.split('\n')[0]).to.equal('The Actor didn\'t answer in time. Zapier stops a step after 30 seconds, so this action '
                    + 'supports only Server Actors that answer within about 25 seconds. The request may still have been charged.');
                expectNoRetryAdvice(error);
                expect(actor.getCallCount()).to.equal(1);
            }).timeout(5000);

            it('halts the step when the body doesn\'t arrive in time, with one deadline for headers and body', async () => {
                requestTiming.stepBudgetMillis = 1000;
                requestTiming.minRequestMillis = 100;
                mockActorLookup();
                mockServerActor({ delayBodyMillis: 3000 });

                const error = await performAndGetError(SIMPLE_REQUEST);

                expect(error.name).to.equal('HaltedError');
            }).timeout(5000);

            it('gives the request only the time the lookups left', async () => {
                // Without the slow lookup, the Actor's 700 ms would fit into the 1.2 s budget.
                requestTiming.stepBudgetMillis = 1200;
                requestTiming.minRequestMillis = 100;
                mockActorLookup({ delayMillis: 700 });
                const actor = mockServerActor({ delayConnectionMillis: 700 });

                const error = await performAndGetError(SIMPLE_REQUEST);

                expect(error.name).to.equal('HaltedError');
                expect(actor.getCallCount()).to.equal(1);
            }).timeout(5000);

            it('doesn\'t send the request when the lookups used up the time', async () => {
                requestTiming.stepBudgetMillis = 600;
                requestTiming.minRequestMillis = 300;
                mockActorLookup({ delayMillis: 400 });
                const actor = mockServerActor();

                const error = await performAndGetError(SIMPLE_REQUEST);

                expect(error).to.include({
                    name: 'AppError',
                    code: 'LookupTimeout',
                    message: 'Looking up the Actor on Apify took too long, so the request wasn\'t sent to the Actor and nothing was charged.',
                });
                expect(actor.getCallCount()).to.equal(0);
            }).timeout(5000);

            it('reports a failed connection without suggesting to send it again', async () => {
                // No interceptor for the Actor's host: with net connect disabled, node-fetch fails with a FetchError,
                // like on a refused connection. (nock's replyWithError never settles with node-fetch 2.)
                mockActorLookup();

                const error = await performAndGetError(SIMPLE_REQUEST);

                expect(error.code).to.equal('RequestFailed');
                expect(error.message).to.match(new RegExp(`^The request to the Actor failed: request to ${WEB_FETCH_ORIGIN}/\\?url=.* failed, `
                    + 'reason: .*\\. The request may still have been charged\\.$'));
                expectNoRetryAdvice(error);
            });
        });

        describe('response', () => {
            const sendWithResponse = async (body, headers) => {
                mockActorLookup();
                mockServerActor({ body, headers });
                return appTester(perform, getBundle(SIMPLE_REQUEST));
            };

            it('keeps text that isn\'t JSON as a string', async () => {
                expect(await sendWithResponse('# Example', { 'Content-Type': 'text/markdown; charset=utf-8' }))
                    .to.eql({ status: 200, contentType: 'text/markdown', body: '# Example' });
            });

            it('parses JSON without a content type', async () => {
                expect(await sendWithResponse('{"ok":true}', {})).to.eql({ status: 200, contentType: null, body: { ok: true } });
            });

            it('returns null for an empty body', async () => {
                expect(await sendWithResponse('', { 'Content-Type': 'application/json' })).to.eql({ status: 200, contentType: 'application/json', body: null });
            });

            it('decodes text in the charset of its content type', async () => {
                expect(await sendWithResponse(Buffer.from('café', 'latin1'), { 'Content-Type': 'text/plain; charset="ISO-8859-1"' }))
                    .to.eql({ status: 200, contentType: 'text/plain', body: 'café' });
                // A charset the runtime doesn't know is read as UTF-8.
                expect(await sendWithResponse(Buffer.from('café', 'utf8'), { 'Content-Type': 'text/plain; charset=x-unknown' }))
                    .to.eql({ status: 200, contentType: 'text/plain', body: 'café' });
            });

            [
                ['by content type', Buffer.from([0x89, 0x50, 0x4e, 0x47]), { 'Content-Type': 'image/png' }, 'image/png'],
                ['by invalid UTF-8', Buffer.from([0xff, 0xfe, 0x00, 0x01]), {}, 'no content type'],
            ].forEach(([title, body, headers, contentTypeText]) => {
                it(`fails on a binary response, ${title}`, async () => {
                    const error = await sendWithResponse(body, headers).then(() => {
                        throw new Error('Expected the step to fail');
                    }, parseAppError);

                    expect(error).to.include({
                        code: 'BinaryResponse',
                        message: `The Actor returned a binary response (${contentTypeText}), which this action doesn't support yet. `
                            + 'The request may still have been charged.',
                    });
                });
            });
        });
    });
});
