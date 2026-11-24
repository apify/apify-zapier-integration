const nock = require('nock');
const WEB_FETCH_OPENAPI = require('./webFetchOpenApi.json');

/**
 * Fixtures and mocks for Send Server Actor Request. Every Server Actor request in the tests is mocked: each real one
 * costs money. The mocks use Web Fetch's public identity, and the request side of its real OpenAPI document
 * (webFetchOpenApi.json, from the Actor's default build, without the responses).
 */

const WEB_FETCH_ACTOR_ID = 'a6Sqhlnt4touIHTub';
const WEB_FETCH_ORIGIN = 'https://web-fetch.apify.actor';

// The mocked tests assert on the Authorization header, so they need a token in both test modes.
const MOCKED_TOKEN = 'apify_api_mocked_token';

const getBundle = (inputData, extra = {}) => ({
    authData: { access_token: MOCKED_TOKEN },
    inputData: { actorId: WEB_FETCH_ACTOR_ID, ...inputData },
    meta: {},
    ...extra,
});

const getMockServerActor = (overrides = {}) => ({
    id: WEB_FETCH_ACTOR_ID,
    name: 'web-fetch',
    username: 'apify',
    title: 'Web Fetch',
    standbyUrl: WEB_FETCH_ORIGIN,
    actorStandby: { isEnabled: true },
    ...overrides,
});

/**
 * An OpenAPI document with what Web Fetch's doesn't have: path parameters declared on the path and on the operation,
 * an undeclared placeholder, a `+json` body behind a `$ref`, typed body properties, a query parameter and a body
 * property with the same name, a body that is an array, and hidden utility paths.
 */
const ITEMS_OPENAPI = {
    openapi: '3.1.0',
    info: { title: 'Items', version: '1.0' },
    paths: {
        '/items/{itemId}': {
            parameters: [
                { name: 'itemId', in: 'path', required: true, schema: { type: 'string' } },
                { name: 'limit', in: 'query', description: 'Path-level limit.', schema: { type: 'integer', default: 10 } },
            ],
            post: {
                summary: 'Update an item',
                parameters: [
                    { name: 'limit', in: 'query', description: 'Operation-level limit.', schema: { type: 'integer', default: 20 } },
                    { name: 'tags', in: 'query', schema: { type: 'array', items: { type: 'string' } } },
                    { name: 'mode', in: 'query', schema: { $ref: '#/components/schemas/Mode' } },
                ],
                requestBody: {
                    required: true,
                    content: { 'application/vnd.api+json': { schema: { $ref: '#/components/schemas/Item' } } },
                },
            },
        },
        '/items/{itemId}/notes/{noteId}': {
            get: {
                description: 'Get a note.\nThe second line is left out of the label.',
                parameters: [{ name: 'itemId', in: 'path', schema: { type: 'string' } }],
            },
        },
        '/batch': {
            post: {
                summary: 'Create items in a batch',
                requestBody: {
                    content: { 'application/json': { schema: { type: 'array', items: { $ref: '#/components/schemas/Item' } } } },
                },
            },
        },
        '/health': { get: { summary: 'Health check' } },
        '/openapi.json': { get: { summary: 'This document' } },
    },
    components: {
        schemas: {
            Mode: { type: 'string', enum: ['fast', 'full'], description: 'How to process the item.' },
            Item: {
                type: 'object',
                required: ['name'],
                properties: {
                    name: { type: 'string', description: 'The item\'s [name](https://example.com) with *emphasis*.', example: 'Lamp' },
                    count: { type: 'integer' },
                    ratio: { type: 'number' },
                    active: { type: 'boolean', default: true },
                    limit: { type: 'integer' },
                    note: { anyOf: [{ type: 'string' }, { type: 'null' }], default: null },
                    ids: { type: 'array', items: { type: 'integer' } },
                    labels: { type: 'object', additionalProperties: { type: 'string' } },
                    weights: { type: 'object', additionalProperties: { type: 'number' } },
                    meta: { type: 'object', properties: { color: { type: 'string' } } },
                },
            },
        },
    },
};

/** Mocks the Actor lookup and, for a Server Actor, its default build. */
const mockActorLookup = ({
    actorId = WEB_FETCH_ACTOR_ID,
    actor = getMockServerActor(),
    actorDefinition = { webServerSchema: WEB_FETCH_OPENAPI },
    withBuild = true,
    delayMillis = 0,
} = {}) => {
    const scope = nock('https://api.apify.com');
    scope.get(`/v2/acts/${actorId}`).delay(delayMillis).reply(200, { data: actor });
    if (withBuild) scope.get(`/v2/acts/${actor.id}/builds/default`).reply(200, { data: { id: 'buildId', actorDefinition } });
    return scope;
};

/**
 * Mocks one endpoint of the Server Actor. It is persisted and counts its calls, so a test can assert that the
 * request was sent exactly once, and records each request's URL, headers and body.
 */
const mockServerActor = ({
    method = 'GET',
    path = '/',
    status = 200,
    body = { ok: true },
    headers = { 'Content-Type': 'application/json' },
    delayConnectionMillis,
    delayBodyMillis,
    origin = WEB_FETCH_ORIGIN,
} = {}) => {
    const requests = [];
    let interceptor = nock(origin)
        .intercept((uri) => uri.split('?')[0] === path, method)
        .query(true);
    if (delayConnectionMillis) interceptor = interceptor.delayConnection(delayConnectionMillis);
    if (delayBodyMillis) interceptor = interceptor.delayBody(delayBodyMillis);
    const scope = interceptor
        .reply(function (uri, requestBody) {
            requests.push({ url: new URL(uri, origin), headers: this.req.headers, body: requestBody });
            return [status, body, headers];
        })
        .persist();
    return {
        scope,
        requests,
        getCallCount: () => requests.length,
    };
};

/** Reads the parts of a z.errors.Error, which keeps them as JSON in its message. */
const parseAppError = (err) => {
    try {
        return { name: err.name, ...JSON.parse(err.message) };
    } catch (parseError) {
        return { name: err.name, message: err.message };
    }
};

module.exports = {
    WEB_FETCH_ACTOR_ID,
    WEB_FETCH_ORIGIN,
    WEB_FETCH_OPENAPI,
    MOCKED_TOKEN,
    ITEMS_OPENAPI,
    getBundle,
    getMockServerActor,
    mockActorLookup,
    mockServerActor,
    parseAppError,
};
