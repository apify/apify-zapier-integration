/**
 * Server Actors answer HTTP requests at their `standbyUrl` instead of starting a run (the API keeps the old "standby"
 * names). This module decodes their responses and turns their error statuses into messages for the user.
 *
 * Every request to a Server Actor may be charged, so it is sent exactly once: no wrapRequestWithRetries, no
 * RetryableError, no redirects, no Zapier throttle retry on a 429, and no message that suggests trying again.
 */

const CHARGED = 'The request may still have been charged.';

const HELP_TEXT_MAX_LENGTH = 1000;

const isObject = (value) => typeof value === 'object' && value !== null && !Array.isArray(value);

const truncate = (text, maxLength) => (text.length > maxLength ? `${text.slice(0, maxLength - 1)}…` : text);

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

module.exports = {
    decodeResponseBody,
    getErrorFromBody,
    toResult,
};
