const {
    APIFY_ACTOR_HOST_SUFFIX,
    APIFY_API_ENDPOINTS,
    SERVER_ACTOR_MIN_REQUEST_MILLIS,
    SERVER_ACTOR_STEP_BUDGET_MILLIS,
} = require('./consts');
const { wrapRequestWithRetries, isValidApiPathSegment } = require('./request_helpers');
const { isActorNotFoundError } = require('./apify_helpers');

/**
 * Server Actors answer HTTP requests at their `standbyUrl` instead of starting a run (the API keeps the old "standby"
 * names). This module backs the Send Server Actor Request create: it looks the Actor up, builds the request, sends it
 * and decodes the response.
 *
 * Every request to a Server Actor may be charged, so it is sent exactly once: no wrapRequestWithRetries, no
 * RetryableError, no redirects, no Zapier throttle retry on a 429, and no message that suggests trying again.
 */

const CHARGED = 'The request may still have been charged.';

// Messages for the user, in Markdown. Errors use them through toPlainText().
const MESSAGES = {
    noActor: 'Choose a Server Actor.',
    invalidActor: 'Enter the Actor as an ID or as username~name, e.g. apify~web-fetch.',
    noServerInterface: 'This Actor has no server interface. Use **Run Actor** to start a run instead.',
    timeout: 'The Actor didn\'t answer in time. Zapier stops a step after 30 seconds, so this action supports only Server Actors '
        + `that answer within about ${SERVER_ACTOR_STEP_BUDGET_MILLIS / 1000} seconds. ${CHARGED}`,
    lookupTooSlow: 'Looking up the Actor on Apify took too long, so the request wasn\'t sent to the Actor and nothing was charged.',
};

const toPlainText = (markdown) => markdown.replace(/\*\*/g, '');

const HTTP_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'];

const HELP_TEXT_MAX_LENGTH = 1000;

/** Keys are a contract with saved Zaps, never rename them. */
const FIELD_KEYS = {
    actorId: 'actorId',
    customMethod: 'customMethod',
    customPath: 'customPath',
    customQuery: 'customQuery',
    customBody: 'customBody',
};

const isObject = (value) => typeof value === 'object' && value !== null && !Array.isArray(value);

const isBlank = (value) => value === undefined || value === null || (typeof value === 'string' && !value.trim());

const truncate = (text, maxLength) => (text.length > maxLength ? `${text.slice(0, maxLength - 1)}…` : text);

/* ------------------------------------------------------------------------------------------------------------------ */
/* Request                                                                                                            */
/* ------------------------------------------------------------------------------------------------------------------ */

// Nothing has been sent when these are thrown, so nothing was charged.
const invalidInput = (z, message) => new z.errors.Error(toPlainText(message), 'InvalidInput', 400);

const parseJsonBody = (z, value, label) => {
    let body = value;
    if (typeof value === 'string') {
        try {
            body = JSON.parse(value);
        } catch (err) {
            throw invalidInput(z, `"${label}" isn't valid JSON: ${err.message}`);
        }
    }
    if (typeof body !== 'object' || body === null) throw invalidInput(z, `"${label}" must be a JSON object or array.`);
    return body;
};

/** Custom path's request: method, path, query parameters and JSON body. Only the `custom*` keys are read. */
const buildCustomRequest = (z, inputData) => {
    const rawMethod = inputData[FIELD_KEYS.customMethod];
    const method = isBlank(rawMethod) ? 'GET' : String(rawMethod).trim().toUpperCase();
    if (!HTTP_METHODS.includes(method)) throw invalidInput(z, `"Method" must be one of ${HTTP_METHODS.join(', ')}, but it is "${rawMethod}".`);

    const rawPath = isBlank(inputData[FIELD_KEYS.customPath]) ? '' : String(inputData[FIELD_KEYS.customPath]).trim();
    // The host is never editable: a full URL or a protocol-relative `//host` path is refused, not sent anywhere.
    if (/^[a-z][a-z\d+.-]*:/i.test(rawPath) || rawPath.startsWith('//')) {
        throw invalidInput(z, `"Path" must be a path on the Actor's server, e.g. /search, not a URL or host. It is "${rawPath}".`);
    }
    const path = `/${rawPath.replace(/^\/+/, '')}`;

    const rawQuery = inputData[FIELD_KEYS.customQuery];
    if (!isBlank(rawQuery) && !isObject(rawQuery)) throw invalidInput(z, '"Query parameters" must be a set of key-value pairs.');
    const query = Object.entries(rawQuery || {})
        .filter(([name]) => name.trim())
        .map(([name, value]) => ({ name, value, explode: true }));

    let body;
    if (method !== 'GET') {
        const rawBody = inputData[FIELD_KEYS.customBody];
        body = isBlank(rawBody) ? {} : parseJsonBody(z, rawBody, 'Body (JSON)');
    }

    return { method, path, query, body };
};

const toQueryText = (value) => (typeof value === 'object' && value !== null ? JSON.stringify(value) : String(value));

/**
 * The request URL: the Actor's origin, the path, then the query parameters after any query already in the path. Arrays
 * are repeated (`?a=1&a=2`), or comma-joined for `explode: false`; objects are sent as JSON.
 */
const buildRequestUrl = (z, origin, { path, query }) => {
    let url;
    try {
        url = new URL(`${origin}${path}`);
    } catch (err) {
        throw invalidInput(z, `"${path}" isn't a valid path.`);
    }

    const params = new URLSearchParams();
    query.forEach(({ name, value, explode }) => {
        if (Array.isArray(value) && !explode) params.append(name, value.map(toQueryText).join(','));
        else (Array.isArray(value) ? value : [value]).forEach((item) => params.append(name, toQueryText(item)));
    });
    const added = params.toString();
    if (added) url.search = url.search ? `${url.search}&${added}` : added;

    // The request carries the Apify token, so it must not leave the Actor's host.
    if (url.origin !== origin) throw invalidInput(z, `"${path}" isn't a valid path on the Actor's server.`);
    return url;
};

/**
 * The step's time budget. Zapier kills a step at 30 s, and the Actor and OpenAPI lookups count against it, so the
 * request gets what's left. An object, so tests can shorten it.
 */
const requestTiming = {
    stepBudgetMillis: SERVER_ACTOR_STEP_BUDGET_MILLIS,
    minRequestMillis: SERVER_ACTOR_MIN_REQUEST_MILLIS,
};

const isTimeoutError = (err) => err.name === 'AbortError';

/**
 * Sends the request once and reads the whole body. One AbortSignal bounds the request and the body together: node-fetch's
 * own `timeout` starts again for the body, which could let the step run past Zapier's 30 s.
 */
const sendServerActorRequest = async (z, { url, method, body }, stepStartedAt) => {
    const remainingMillis = requestTiming.stepBudgetMillis - (Date.now() - stepStartedAt);
    if (remainingMillis < requestTiming.minRequestMillis) throw new z.errors.Error(MESSAGES.lookupTooSlow, 'LookupTimeout');

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), remainingMillis);
    try {
        const response = await z.request({
            url: url.toString(),
            method,
            headers: body === undefined ? {} : { 'Content-Type': 'application/json' },
            body: body === undefined ? undefined : JSON.stringify(body),
            // Read by the response middleware, which then leaves the response alone.
            serverActorRequest: true,
            // Bytes, so binary responses can be detected. `response.content` throws when read.
            raw: true,
            // The status is mapped below, with the Actor's own message.
            skipThrowForStatus: true,
            // Otherwise core turns a 429 into ThrottledError, which Zapier retries about every 65 s, each time paid.
            throwForThrottlingEarly: false,
            // Following a redirect is a second, possibly charged request, and could take the token to another host.
            redirect: 'manual',
            signal: controller.signal,
        });
        const buffer = await response.buffer();
        const contentTypeHeader = response.headers.get('content-type') || '';
        const contentType = contentTypeHeader.split(';')[0].trim().toLowerCase();
        const charset = /;\s*charset\s*=\s*"?([^";\s]+)/i.exec(contentTypeHeader)?.[1];
        return { status: response.status, contentType, charset, buffer };
    } catch (err) {
        // HaltedError is the only error Autoreplay never replays.
        if (isTimeoutError(err)) throw new z.errors.HaltedError(MESSAGES.timeout);
        if (err.name === 'FetchError') throw new z.errors.Error(`The request to the Actor failed: ${err.message}. ${CHARGED}`, 'RequestFailed');
        throw err;
    } finally {
        clearTimeout(timer);
    }
};

/* ------------------------------------------------------------------------------------------------------------------ */
/* Response (pure, except for the errors)                                                                             */
/* ------------------------------------------------------------------------------------------------------------------ */

const TEXT_APPLICATION_SUBTYPES = 'json|xml|javascript|ecmascript|x-ndjson|ndjson|x-www-form-urlencoded|yaml|x-yaml|graphql|csv';
const TEXT_CONTENT_TYPES = new RegExp(`^(text/|application/(.+\\+)?(${TEXT_APPLICATION_SUBTYPES})$)`);
const JSON_CONTENT_TYPES = /^application\/(.+\+)?json$/;

/** A decoder for the response's charset. A charset the runtime doesn't know is read as UTF-8. */
const getTextDecoder = (charset) => {
    try {
        return new TextDecoder(charset || 'utf-8', { fatal: true });
    } catch (err) {
        return new TextDecoder('utf-8', { fatal: true });
    }
};

/**
 * Decodes a response body: JSON is parsed, other text stays a string, and binary data returns `{ binary: true }`. Text
 * is decoded in the charset of its content type, by default UTF-8. A body without a content type counts as text if it
 * is valid UTF-8. `contentType` is lowercased, without parameters.
 */
const decodeResponseBody = (buffer, contentType, charset) => {
    if (!buffer || buffer.length === 0) return { body: null };
    if (contentType && !TEXT_CONTENT_TYPES.test(contentType)) return { binary: true };

    let text;
    try {
        text = getTextDecoder(charset).decode(buffer);
    } catch (err) {
        return { binary: true };
    }
    if (!contentType || JSON_CONTENT_TYPES.test(contentType)) {
        try {
            return { body: JSON.parse(text) };
        } catch (err) {
            return { body: text };
        }
    }
    return { body: text };
};

const nonEmptyString = (value) => (typeof value === 'string' && value.trim() ? value.trim() : undefined);

const HTML_CONTENT_TYPES = /^(text\/html|application\/xhtml\+xml)$/;
const HTML_ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: '\'', nbsp: ' ' };

const isHtml = (text, contentType) => HTML_CONTENT_TYPES.test(contentType || '') || /^\s*<(!doctype\s+html|html)[\s>]/i.test(text);

const decodeHtmlEntities = (text) => text.replace(/&(#x[\da-f]+|#\d+|[a-z]+);/gi, (entity, name) => {
    if (name[0] !== '#') return HTML_ENTITIES[name.toLowerCase()] ?? entity;
    const codePoint = /^#x/i.test(name) ? parseInt(name.slice(2), 16) : parseInt(name.slice(1), 10);
    return codePoint <= 0x10FFFF ? String.fromCodePoint(codePoint) : entity;
});

/** The `<title>` of an HTML page, the only readable part of an error page full of markup and scripts. */
const getHtmlTitle = (html) => {
    const match = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html);
    return match ? nonEmptyString(decodeHtmlEntities(match[1]).replace(/\s+/g, ' ')) : undefined;
};

/**
 * Finds an error message in a response body: Apify's `{ error: { type, message } }`, a flat `{ error, code }` (e.g.
 * Web Fetch), `{ message }`, `{ detail }`, `{ title }`, plain text, or the title of an HTML page.
 */
const getErrorFromBody = (body, contentType) => {
    if (typeof body === 'string') {
        const message = isHtml(body, contentType) ? getHtmlTitle(body) : nonEmptyString(body);
        return { message: message && truncate(message, HELP_TEXT_MAX_LENGTH) };
    }
    if (!isObject(body)) return {};
    const nested = isObject(body.error) ? body.error : {};
    return {
        message: [nested.message, body.error, body.message, body.detail, body.title].map(nonEmptyString).find(Boolean),
        type: [nested.type, body.code, body.type].map(nonEmptyString).find(Boolean),
    };
};

const withPeriod = (text) => (/[.!?]$/.test(text) ? text : `${text}.`);

/** The error for a 4xx or 5xx answer, with the Actor's own message and status. */
const toActorError = (z, status, body, contentType) => {
    const { message, type } = getErrorFromBody(body, contentType);
    const details = message ? `Status ${status}: ${withPeriod(message)}` : `Status ${status}.`;
    // Apify answers 504 when an Actor sends nothing for 300 s, and Actors use it for their own gateway timeouts.
    if (status === 504) return new z.errors.Error(`The Actor didn't answer in time. ${CHARGED} ${details}`, type || 'Timeout', status);

    const text = message ? `The Actor answered with status ${status}: ${withPeriod(message)}` : `The Actor answered with status ${status}.`;
    const code = status === 401 ? 'AuthenticationError' : type || 'ServerActorError';
    // Zapier could read an error with status 429 as throttling and run the step again, sending a paid request twice.
    const errorStatus = status === 429 ? undefined : status;
    return new z.errors.Error(status >= 500 ? `${text} ${CHARGED}` : text, code, errorStatus);
};

/** Turns the Actor's answer into `{ status, contentType, body }`, or throws for an error status or a binary body. */
const toResult = (z, { status, contentType, charset, buffer }) => {
    const decoded = decodeResponseBody(buffer, contentType, charset);
    if (status >= 400) throw toActorError(z, status, decoded.body, contentType);
    if (decoded.binary) {
        throw new z.errors.Error(
            `The Actor returned a binary response (${contentType || 'no content type'}), which this action doesn't support yet. ${CHARGED}`,
            'BinaryResponse',
            status,
        );
    }
    // A redirect isn't followed, so a 3xx comes back as the result.
    return { status, contentType: contentType || null, body: decoded.body };
};

/* ------------------------------------------------------------------------------------------------------------------ */
/* Actor lookup                                                                                                       */
/* ------------------------------------------------------------------------------------------------------------------ */

/**
 * The origin of the Actor's server, or `undefined` when it has no server interface. Only `https://*.apify.actor`
 * counts, since the request carries the Apify token. The build's `usesStandbyMode` isn't used: many Server Actors
 * don't set it.
 */
const getServerActorOrigin = (actor) => {
    const isEnabled = Boolean(actor) && isObject(actor.actorStandby) && actor.actorStandby.isEnabled === true;
    if (!isEnabled || typeof actor.standbyUrl !== 'string') return undefined;
    try {
        const url = new URL(actor.standbyUrl);
        return url.protocol === 'https:' && url.hostname.endsWith(APIFY_ACTOR_HOST_SUFFIX) ? url.origin : undefined;
    } catch (err) {
        return undefined;
    }
};

/**
 * The Actor ID from the Actor field: an ID or `username~name`, trimmed. Returns `''` when the field is empty, and
 * `undefined` for a value that can't be an ID or name.
 */
const parseActorReference = (value) => {
    const text = typeof value === 'string' ? value.trim() : '';
    if (!text) return '';
    // The ID becomes a segment of the API URL path, where "." and ".." would be resolved as dot segments.
    return isValidApiPathSegment(text) ? text : undefined;
};

const getActorUrl = (actorId) => `${APIFY_API_ENDPOINTS.actors}/${encodeURIComponent(actorId)}`;

/**
 * Looks up the Actor and its server, from GET /v2/acts/{id}:
 * - `notFound`: the Actor doesn't exist, or the account can't access it.
 * - `noServer`: no server interface.
 * - `rest`: everything else, with the origin of its server.
 */
const getServerActorInterface = async (z, actorId) => {
    let actor;
    try {
        ({ data: actor } = await wrapRequestWithRetries(z.request, { url: getActorUrl(actorId) }));
    } catch (err) {
        if (isActorNotFoundError(err)) return { type: 'notFound' };
        throw err;
    }

    const origin = getServerActorOrigin(actor);
    if (!origin) return { type: 'noServer', actor };

    return { type: 'rest', actor, origin };
};

module.exports = {
    FIELD_KEYS,
    HTTP_METHODS,
    MESSAGES,
    buildCustomRequest,
    buildRequestUrl,
    decodeResponseBody,
    getErrorFromBody,
    getServerActorInterface,
    getServerActorOrigin,
    invalidInput,
    parseActorReference,
    requestTiming,
    sendServerActorRequest,
    toResult,
};
