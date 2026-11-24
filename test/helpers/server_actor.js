const nock = require('nock');

/**
 * Fixtures and mocks for Send Server Actor Request. Every Server Actor request in the tests is mocked: each real one
 * costs money. The mocks use Web Fetch's public identity.
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

/** Mocks the Actor lookup. */
const mockActorLookup = ({
    actorId = WEB_FETCH_ACTOR_ID,
    actor = getMockServerActor(),
    delayMillis = 0,
} = {}) => {
    const scope = nock('https://api.apify.com');
    scope.get(`/v2/acts/${actorId}`).delay(delayMillis).reply(200, { data: actor });
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
    MOCKED_TOKEN,
    getBundle,
    getMockServerActor,
    mockActorLookup,
    mockServerActor,
    parseAppError,
};
