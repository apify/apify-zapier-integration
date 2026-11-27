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
 * names). This module backs the Send Server Actor Request create: it finds out what an Actor's server offers, turns its
 * OpenAPI document into Zapier input fields, builds the request from them, sends it and decodes the response.
 *
 * Every request to a Server Actor may be charged, so it is sent exactly once: no wrapRequestWithRetries, no
 * RetryableError, no redirects, no Zapier throttle retry on a 429, and no message that suggests trying again.
 *
 * The OpenAPI parsing and field mapping are pure, so they are unit-testable without `z`.
 */

const CHARGED = 'The request may still have been charged.';

// Markdown, for the read-only `copy` fields of the form. Errors use the same text through toPlainText().
const MESSAGES = {
    selectActor: 'Select a Server Actor to see its endpoints. An Actor mapped from an earlier step can only use **Custom path**.',
    noActor: 'Choose a Server Actor.',
    invalidActor: 'Enter the Actor as an ID, as username~name, or as its Apify Store URL, e.g. https://apify.com/apify/web-fetch.',
    noServerInterface: 'This Actor has no server interface. Use **Run Actor** to start a run instead.',
    mcpOnly: 'This Actor is an MCP server for AI assistants and has no HTTP endpoints Zapier can send requests to. '
        + 'Connect it to an MCP client, or use **Run Actor** to start a run instead.',
    noEndpoint: 'Choose an endpoint.',
    noParameters: 'This endpoint takes no parameters.',
    timeout: 'The Actor didn\'t answer in time. Zapier stops a step after 30 seconds, so this action supports only Server Actors '
        + `that answer within about ${SERVER_ACTOR_STEP_BUDGET_MILLIS / 1000} seconds. ${CHARGED}`,
    lookupTooSlow: 'Looking up the Actor on Apify took too long, so the request wasn\'t sent to the Actor and nothing was charged.',
};

const toPlainText = (markdown) => markdown.replace(/\*\*/g, '');

/** An error's message for the user. A z.errors.Error keeps its message, code and status as JSON. */
const getErrorMessage = (err) => {
    if (err && err.name === 'AppError') {
        try {
            return JSON.parse(err.message).message;
        } catch (parseError) {
            // Not JSON after all, used as it is.
        }
    }
    return String((err && err.message) || err);
};

const getStaleEndpointMessage = (endpointValue) => `The endpoint "${endpointValue}" isn't in this Actor's OpenAPI definition. `
    + 'Choose the endpoint again, or use **Custom path**.';

const getNoOpenApiMessage = (actorId) => 'This Actor doesn\'t document its endpoints. Choose **Custom path**, and find the method '
    + `and path in the Actor's [README](https://console.apify.com/actors/${encodeURIComponent(actorId)}/information/latest/readme).`;

const HTTP_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'];

// Paths Actors expose for the platform or for docs, not for callers.
const HIDDEN_PATHS = new Set([
    '/health',
    '/healthz',
    '/openapi.json',
    '/openapi.yaml',
    '/docs',
    '/favicon.ico',
    '/robots.txt',
    '/mcp',
    '/sse',
]);

// At most this many `$ref`s are followed in a chain. Past it, and where a ref repeats in its own chain (a cycle), only
// the target's own keywords are kept (see toShallowSchema).
const MAX_REF_DEPTH = 10;
const HELP_TEXT_MAX_LENGTH = 1000;
const PLACEHOLDER_MAX_LENGTH = 1000;
const ENDPOINT_SUMMARY_MAX_LENGTH = 80;

/**
 * Keys are a contract with saved Zaps, never rename them. The typed parameters of a documented endpoint are keyed by
 * where the value goes and its name, e.g. `query_limit`. `perform` routes values with the entries the fields were built
 * from (getEndpointEntries), never by parsing the keys.
 */
const CUSTOM_ENDPOINT = '__custom__';
const FIELD_KEYS = {
    actorId: 'actorId',
    endpoint: 'endpoint',
    wholeBody: 'bodyJson',
    customMethod: 'customMethod',
    customPath: 'customPath',
    customQuery: 'customQuery',
    customBody: 'customBody',
};
const PARAMETER_KEY_PREFIXES = { path: 'path_', query: 'query_', body: 'body_' };

const isObject = (value) => typeof value === 'object' && value !== null && !Array.isArray(value);

const isBlank = (value) => value === undefined || value === null || (typeof value === 'string' && !value.trim());

const truncate = (text, maxLength) => (text.length > maxLength ? `${text.slice(0, maxLength - 1)}…` : text);

// The Actor's author controls summaries and descriptions, and Zapier renders `helpText` as Markdown, so this text must
// not turn into links, images or HTML. Backticks are escaped too, so inline code shows as plain text: renderers pair
// backtick runs in their own way (run lengths, table cells), and text left alone as code could end up a link.
const MARKDOWN_SPECIAL_CHARS = /[\\`*_[\]()!<>]/g;

const escapeMarkdown = (text) => String(text).replace(MARKDOWN_SPECIAL_CHARS, '\\$&');

/** Escapes `text` and cuts it to `maxLength`. The text is cut before escaping, so no escape sequence is cut in half. */
const escapeMarkdownWithin = (text, maxLength) => {
    let chars = Array.from(String(text));
    let escaped = escapeMarkdown(chars.join(''));
    if (escaped.length <= maxLength) return escaped;
    while (chars.length && escaped.length > maxLength - 1) {
        // Escaping at most doubles the length, so cutting half the excess always makes progress.
        chars = chars.slice(0, chars.length - Math.max(1, Math.ceil((escaped.length - (maxLength - 1)) / 2)));
        escaped = escapeMarkdown(chars.join(''));
    }
    return `${escaped}…`;
};

/* ------------------------------------------------------------------------------------------------------------------ */
/* OpenAPI document (pure)                                                                                            */
/* ------------------------------------------------------------------------------------------------------------------ */

/** Parses `webServerSchema`, which the API returns as an object or, for some builds, as a JSON string. */
const parseOpenApiDocument = (schema) => {
    if (isObject(schema)) return schema;
    if (typeof schema !== 'string') return undefined;
    try {
        const parsed = JSON.parse(schema);
        return isObject(parsed) ? parsed : undefined;
    } catch (err) {
        return undefined;
    }
};

/** Resolves a local JSON pointer such as `#/components/schemas/FetchRequest/properties/url`. */
const resolvePointer = (document, ref) => {
    if (!ref.startsWith('#/')) return undefined;
    try {
        return ref
            .slice(2)
            .split('/')
            .map((part) => decodeURIComponent(part).replace(/~1/g, '/').replace(/~0/g, '~'))
            .reduce((node, key) => (isObject(node) ? node[key] : undefined), document);
    } catch (err) {
        // A malformed percent-encoding in the pointer.
        return undefined;
    }
};

const isFlatValue = (value) => !isObject(value) && !(Array.isArray(value) && value.some((item) => typeof item === 'object' && item !== null));

/**
 * What a ref that is cut short (a cycle, or past MAX_REF_DEPTH) leaves: the target's own keywords, such as `type` and
 * `description`, without anything nested, so a field built from it still gets the right kind. The cache below shares a
 * schema between all its uses, including where it was cut, so `{}` would turn e.g. an object into a string field.
 */
const toShallowSchema = (target) => (isObject(target)
    ? Object.fromEntries(Object.entries(target).filter(([key, value]) => key !== '$ref' && isFlatValue(value)))
    : {});

/**
 * Returns `node` with its local `$ref`s resolved. Unresolvable or remote refs become `{}`. Each ref is resolved once
 * per call and its result shared, so the work stays proportional to the document: without that, a small document
 * whose schemas each reference the next one many times would expand into billions of nodes and freeze the step.
 * The shared results must not be mutated.
 */
const resolveRefs = (document, node, refs = [], resolved = new Map()) => {
    if (Array.isArray(node)) return node.map((item) => resolveRefs(document, item, refs, resolved));
    if (!isObject(node)) return node;
    if (typeof node.$ref === 'string') {
        const ref = node.$ref;
        if (refs.length >= MAX_REF_DEPTH || refs.includes(ref)) return toShallowSchema(resolvePointer(document, ref));
        if (!resolved.has(ref)) {
            const target = resolvePointer(document, ref);
            resolved.set(ref, target === undefined ? {} : resolveRefs(document, target, [...refs, ref], resolved));
        }
        return resolved.get(ref);
    }
    return Object.fromEntries(Object.entries(node).map(([key, value]) => [key, resolveRefs(document, value, refs, resolved)]));
};

/**
 * A path item, with the shared path item its `$ref` points to (OpenAPI 3.1's `components.pathItems`) merged in, and the
 * operations next to the `$ref` kept. The endpoint list and the endpoint's fields both read it, so every listed endpoint
 * can be loaded.
 */
const getPathItem = (document, path) => {
    const paths = document && document.paths;
    const pathItem = isObject(paths) ? paths[path] : undefined;
    if (!isObject(pathItem) || typeof pathItem.$ref !== 'string') return pathItem;
    const { $ref, ...operations } = pathItem;
    const shared = resolvePointer(document, $ref);
    return { ...(isObject(shared) ? shared : {}), ...operations };
};

/** The endpoints of an OpenAPI document, e.g. `{ value: 'POST /search', label: 'POST /search - Search', method, path }`. */
const parseOpenApiEndpoints = (document) => {
    const paths = document && document.paths;
    if (!isObject(paths)) return [];

    return Object.keys(paths)
        .filter((path) => !HIDDEN_PATHS.has(path))
        .map((path) => [path, getPathItem(document, path)])
        .filter(([, pathItem]) => isObject(pathItem))
        .flatMap(([path, pathItem]) => HTTP_METHODS
            .filter((method) => isObject(pathItem[method.toLowerCase()]))
            .map((method) => {
                const operation = pathItem[method.toLowerCase()];
                const value = `${method} ${path}`;
                const summary = [operation.summary, operation.description].find((text) => typeof text === 'string' && text.trim());
                // Labels aren't rendered as Markdown, so the summary stays plain text.
                const label = summary ? `${value} - ${truncate(summary.trim().split(/\r?\n/)[0], ENDPOINT_SUMMARY_MAX_LENGTH)}` : value;
                return { value, label, method, path };
            }));
};

/** Splits an endpoint value like `POST /items/{id}` into its method and path. */
const parseEndpointValue = (value) => {
    const match = /^([A-Z]+) (\/\S*)$/.exec(String(value || '').trim());
    if (!match || !HTTP_METHODS.includes(match[1])) return undefined;
    return { method: match[1], path: match[2] };
};

/** Finds an endpoint's operation, with path-level and operation-level parameters merged and `$ref`s resolved. */
const getEndpointOperation = (document, method, path) => {
    const pathItem = resolveRefs(document, getPathItem(document, path));
    if (!isObject(pathItem)) return undefined;
    const operation = pathItem[method.toLowerCase()];
    if (!isObject(operation)) return undefined;

    // Operation-level parameters override path-level ones with the same name and location.
    const parameters = new Map();
    [pathItem.parameters, operation.parameters]
        .filter(Array.isArray)
        .flat()
        .filter((parameter) => isObject(parameter) && typeof parameter.name === 'string' && parameter.name && typeof parameter.in === 'string')
        .forEach((parameter) => parameters.set(`${parameter.in}:${parameter.name}`, parameter));

    const requestBody = isObject(operation.requestBody) ? operation.requestBody : {};
    const content = isObject(requestBody.content) ? requestBody.content : {};
    const jsonContentType = Object.keys(content).find((type) => /[/+]json\b/i.test(type));
    const jsonContent = jsonContentType && isObject(content[jsonContentType]) ? content[jsonContentType] : {};

    return {
        parameters: [...parameters.values()],
        bodySchema: isObject(jsonContent.schema) ? jsonContent.schema : undefined,
        bodyExample: jsonContent.example,
        bodyRequired: requestBody.required === true,
    };
};

/* ------------------------------------------------------------------------------------------------------------------ */
/* Schema → Zapier field (pure)                                                                                       */
/* ------------------------------------------------------------------------------------------------------------------ */

/**
 * Reads nullable and wrapped schemas as the type they allow: `type: ['string', 'null']` (OpenAPI 3.1), `anyOf` or
 * `oneOf` with one schema besides `{ type: 'null' }` (e.g. pydantic's `Optional[str]`), and an `allOf` of one schema.
 * Keywords next to the wrapper, such as `description` and `default`, win over the wrapped schema's.
 */
const normalizeSchema = (schema) => {
    if (!isObject(schema)) return {};
    if (Array.isArray(schema.type)) {
        const { type, ...rest } = schema;
        const types = type.filter((item) => item !== 'null');
        return types.length === 1 ? { ...rest, type: types[0] } : rest;
    }
    if (schema.type !== undefined) return schema;

    const { anyOf, oneOf, allOf, ...rest } = schema;
    const variants = (anyOf || oneOf || []).filter((variant) => !(isObject(variant) && variant.type === 'null'));
    if (variants.length === 1 && isObject(variants[0])) return { ...normalizeSchema(variants[0]), ...rest };
    if (Array.isArray(allOf) && allOf.length === 1 && isObject(allOf[0])) return { ...normalizeSchema(allOf[0]), ...rest };
    return schema;
};

const SCALAR_KINDS = { string: 'string', integer: 'integer', number: 'number', boolean: 'boolean' };

const getEnumChoices = (schema) => {
    if (!Array.isArray(schema.enum)) return undefined;
    const choices = [...new Set(schema.enum
        .filter((value) => ['string', 'number', 'boolean'].includes(typeof value))
        .map(String)
        .filter((value) => value.trim()))];
    return choices.length ? choices : undefined;
};

/**
 * How a schema is edited in Zapier and converted back in `perform`: a scalar, a `list` of scalars, a `dict` of
 * key-value pairs with scalar or untyped values, or `json` text for anything else that is an object or array.
 */
const getFieldKind = (schema) => {
    const scalarKind = SCALAR_KINDS[schema.type];
    if (scalarKind) return { kind: scalarKind, choices: scalarKind === 'boolean' ? undefined : getEnumChoices(schema) };

    if (schema.type === 'array') {
        const items = normalizeSchema(schema.items);
        const itemKind = SCALAR_KINDS[items.type];
        if (itemKind && itemKind !== 'boolean') return { kind: 'list', itemKind, choices: getEnumChoices(items) };
        return { kind: 'json' };
    }

    const hasProperties = isObject(schema.properties) && Object.keys(schema.properties).length > 0;
    if (schema.type === 'object' || hasProperties || schema.additionalProperties) {
        if (hasProperties || !schema.additionalProperties) return { kind: 'json' };
        // Key-value pairs hold text, so values that are objects or arrays need JSON.
        const values = normalizeSchema(schema.additionalProperties);
        if (values.type === undefined) return { kind: 'dict' };
        const valueKind = SCALAR_KINDS[values.type];
        return valueKind ? { kind: 'dict', valueKind } : { kind: 'json' };
    }

    return { kind: 'string', choices: getEnumChoices(schema) };
};

const firstDefined = (...values) => values.find((value) => value !== undefined && value !== null);

// Words a label writes in capitals, e.g. `userId` → "User ID".
const LABEL_WORDS = {
    api: 'API', html: 'HTML', http: 'HTTP', https: 'HTTPS', id: 'ID', ids: 'IDs', ip: 'IP', json: 'JSON', url: 'URL', urls: 'URLs', uuid: 'UUID',
};

/**
 * A readable label for a parameter or property name, in sentence case: `includeAboutSection` → "Include about section",
 * `max_results` → "Max results", `url` → "URL". Other words written in capitals, such as `SKU`, stay as they are.
 */
const toFieldLabel = (name) => {
    const words = name
        .replace(/([a-z\d])([A-Z])/g, '$1 $2')
        .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
        .split(/[\s_-]+/)
        .filter(Boolean)
        .map((word) => LABEL_WORDS[word.toLowerCase()] || (/^[A-Z\d]{2,}$/.test(word) ? word : word.toLowerCase()));
    if (!words.length) return name;
    const label = words.join(' ');
    return `${label.charAt(0).toUpperCase()}${label.slice(1)}`;
};

/**
 * Where a value goes and how it's typed. The input fields and the request are both built from these entries, so a
 * value can only end up where the field shown for it says.
 */
const createEntry = (location, name, rawSchema, {
    required, requiredInBody, bodyRequired, description, example, style, explode,
} = {}) => {
    const schema = normalizeSchema(rawSchema);
    const examples = Array.isArray(schema.examples) ? schema.examples : [];
    const queryStyle = typeof style === 'string' ? style : 'form';
    return {
        key: location === 'wholeBody' ? FIELD_KEYS.wholeBody : `${PARAMETER_KEY_PREFIXES[location]}${name}`,
        label: location === 'wholeBody' ? 'Body (JSON)' : toFieldLabel(name),
        location,
        name,
        required: Boolean(required),
        // For a body property: the body's schema requires it, and whether the body itself is required.
        requiredInBody: Boolean(requiredInBody),
        bodyRequired: Boolean(bodyRequired),
        // How a query parameter is serialized (see appendQueryParameter). OpenAPI's default is `style: form`, and
        // `explode` defaults to true only for form: `?a=1&a=2`, or `?a=1,2` without it.
        style: queryStyle,
        explode: typeof explode === 'boolean' ? explode : queryStyle === 'form',
        schema,
        description: [description, schema.description].find((text) => typeof text === 'string' && text.trim()),
        // A default goes into `placeholder`, never `default`: Zapier would save today's default into the Zap.
        placeholderValue: firstDefined(schema.default, example, schema.example, examples[0]),
        ...getFieldKind(schema),
    };
};

/**
 * The typed entries of an endpoint: path and query parameters, then the JSON body's top-level properties, or one
 * whole-body entry when the body isn't an object with properties. `undefined` when the endpoint isn't in the document.
 */
const getEndpointEntries = (document, method, path) => {
    const operation = getEndpointOperation(document, method, path);
    if (!operation) return undefined;

    // A placeholder such as `{itemId}` needs a value even when the document doesn't declare it.
    const declared = new Set(operation.parameters.filter((parameter) => parameter.in === 'path').map(({ name }) => name));
    const undeclared = [...new Set([...path.matchAll(/\{([^}]+)\}/g)].map(([, name]) => name))]
        .filter((name) => !declared.has(name))
        .map((name) => ({ name, in: 'path' }));

    const entries = [...undeclared, ...operation.parameters]
        .filter((parameter) => parameter.in === 'path' || parameter.in === 'query')
        .map((parameter) => createEntry(parameter.in, parameter.name, parameter.schema, {
            // Path parameters are always required.
            required: parameter.in === 'path' || parameter.required === true,
            description: parameter.description,
            example: parameter.example,
            style: parameter.style,
            explode: parameter.explode,
        }));

    if (method !== 'GET' && operation.bodySchema) {
        const bodySchema = normalizeSchema(operation.bodySchema);
        const properties = isObject(bodySchema.properties) ? Object.entries(bodySchema.properties).filter(([name]) => name) : [];
        if (properties.length) {
            const requiredNames = new Set(Array.isArray(bodySchema.required) ? bodySchema.required : []);
            properties.forEach(([name, schema]) => entries.push(createEntry('body', name, schema, {
                // The properties an optional body requires are needed only once the body is sent (buildEndpointRequest).
                required: operation.bodyRequired && requiredNames.has(name),
                requiredInBody: requiredNames.has(name),
                bodyRequired: operation.bodyRequired,
            })));
        } else {
            // A body without properties is edited as JSON, whatever its schema says.
            entries.push({
                ...createEntry('wholeBody', 'body', bodySchema, { required: operation.bodyRequired, example: operation.bodyExample }),
                kind: 'json',
                choices: undefined,
            });
        }
    }

    // Fields that would share a label get the location added, e.g. a query parameter and a body property named `limit`,
    // or the name when both are in the same place, e.g. `user_id` and `userId`.
    return entries.map((entry) => {
        const sameLabel = entries.filter(({ label }) => label === entry.label);
        if (entry.location === 'wholeBody' || sameLabel.length === 1) return entry;
        const isSameLocation = sameLabel.filter(({ location }) => location === entry.location).length > 1;
        return { ...entry, label: `${entry.label} (${isSameLocation ? entry.name : entry.location})` };
    });
};

const JSON_HINTS = { array: 'Enter a JSON array.', object: 'Enter a JSON object.' };
const NUMBER_HINTS = {
    integer: { one: 'Enter a whole number.', list: 'Enter whole numbers.', dict: 'Enter whole numbers as the values.' },
    number: { one: 'Enter a number.', list: 'Enter numbers.', dict: 'Enter numbers as the values.' },
};

const getHint = (entry) => {
    if (entry.kind === 'json') return JSON_HINTS[entry.schema.type] || 'Enter JSON.';
    if (entry.kind === 'dict') {
        return entry.valueKind === 'boolean' ? 'Enter true or false as the values.' : NUMBER_HINTS[entry.valueKind]?.dict || '';
    }
    const numberHints = NUMBER_HINTS[entry.kind === 'list' ? entry.itemKind : entry.kind];
    if (numberHints) return entry.kind === 'list' ? numberHints.list : numberHints.one;
    return '';
};

/**
 * Numbers are text fields. Zapier turns text in an `integer` or `number` field into 0 before `perform` sees it, which
 * would send a value nobody entered. As text, an invalid number reaches `convertFieldValue` and fails before sending.
 */
const toFieldType = (kind) => (kind === 'integer' || kind === 'number' ? 'string' : kind);

const toPlaceholder = (entry) => {
    const value = entry.placeholderValue;
    if (value === undefined || value === null) return undefined;
    let text;
    if (['string', 'number', 'boolean'].includes(typeof value)) text = String(value);
    else if (entry.kind === 'list' && Array.isArray(value)) text = value.join(', ');
    else text = JSON.stringify(value);
    text = text.trim();
    return text ? truncate(text, PLACEHOLDER_MAX_LENGTH) : undefined;
};

/** The Zapier input field for an entry. */
const toInputField = (entry) => {
    const field = { key: entry.key, label: entry.label, required: entry.required };

    if (entry.kind === 'list') {
        field.type = toFieldType(entry.itemKind);
        field.list = true;
    } else if (entry.kind === 'dict') {
        field.dict = true;
    } else {
        field.type = entry.kind === 'json' ? 'text' : toFieldType(entry.kind);
    }
    if (entry.choices) field.choices = entry.choices;

    const placeholder = toPlaceholder(entry);
    if (placeholder) field.placeholder = placeholder;

    // A list of choices already says what to enter.
    const hint = entry.choices ? '' : getHint(entry);
    const descriptionMaxLength = HELP_TEXT_MAX_LENGTH - (hint ? hint.length + 1 : 0);
    const helpText = [entry.description && escapeMarkdownWithin(entry.description.trim(), descriptionMaxLength), hint]
        .filter(Boolean)
        .join(' ');
    if (helpText) field.helpText = helpText;

    return field;
};

/** The typed input fields of a documented endpoint, or `undefined` when the endpoint isn't in the document. */
const getEndpointInputFields = (document, method, path) => {
    const entries = getEndpointEntries(document, method, path);
    return entries && entries.map(toInputField);
};

/* ------------------------------------------------------------------------------------------------------------------ */
/* Request                                                                                                            */
/* ------------------------------------------------------------------------------------------------------------------ */

// Nothing has been sent when these are thrown, so nothing was charged.
const invalidInput = (z, message) => new z.errors.Error(toPlainText(message), 'InvalidInput', 400);

const TRUE_VALUES = ['true', 'yes'];
const FALSE_VALUES = ['false', 'no'];

// Decimal notation only. Number() also reads hex, binary, octal, exponents and Infinity, which nobody means to send.
const DECIMAL_NUMBER = /^[+-]?(\d+\.?\d*|\.\d+)$/;

const toNumber = (value) => {
    if (typeof value === 'number') return value;
    const text = String(value).trim();
    return DECIMAL_NUMBER.test(text) ? Number(text) : NaN;
};

/** Converts one value to `kind`. `name` is how the error names the field, e.g. `"Count"`. */
const convertScalar = (z, kind, value, name) => {
    if (kind === 'integer' || kind === 'number') {
        const number = toNumber(value);
        if (!Number.isFinite(number)) throw invalidInput(z, `${name} must be a number, but it is "${value}".`);
        if (kind === 'integer' && !Number.isInteger(number)) throw invalidInput(z, `${name} must be a whole number, but it is "${value}".`);
        // A larger integer can't be sent exactly: 9007199254740993 would be sent as 9007199254740992.
        if (kind === 'integer' && !Number.isSafeInteger(number)) {
            throw invalidInput(z, `${name} must be a whole number between ${Number.MIN_SAFE_INTEGER} and ${Number.MAX_SAFE_INTEGER}, `
                + `but it is "${value}".`);
        }
        return number;
    }
    if (kind === 'boolean') {
        if (typeof value === 'boolean') return value;
        const text = String(value).trim().toLowerCase();
        if (TRUE_VALUES.includes(text)) return true;
        if (FALSE_VALUES.includes(text)) return false;
        throw invalidInput(z, `${name} must be true or false, but it is "${value}".`);
    }
    // A mapped number or boolean, e.g. for a string ID. Servers such as pydantic don't take it as a string.
    return ['number', 'boolean'].includes(typeof value) ? String(value) : value;
};

/** Converts a field value back to what the schema expects. `undefined` means the field is left out of the request. */
const convertFieldValue = (z, entry, value) => {
    if (isBlank(value)) return undefined;

    if (entry.kind === 'list') {
        const items = (Array.isArray(value) ? value : [value])
            .filter((item) => !isBlank(item))
            .map((item) => convertScalar(z, entry.itemKind, item, `"${entry.label}"`));
        return items.length ? items : undefined;
    }
    if (entry.kind === 'dict') {
        if (!isObject(value)) throw invalidInput(z, `"${entry.label}" must be a set of key-value pairs.`);
        // Zapier keeps the blank rows of a dict field. A blank number or true/false is left out, never sent as 0.
        const isTyped = entry.valueKind && entry.valueKind !== 'string';
        const pairs = Object.entries(value)
            .filter(([key, item]) => key.trim() && !(isTyped && isBlank(item)))
            .map(([key, item]) => [key, entry.valueKind ? convertScalar(z, entry.valueKind, item, `"${key}" in "${entry.label}"`) : item]);
        return pairs.length ? Object.fromEntries(pairs) : undefined;
    }
    if (entry.kind === 'json') {
        if (typeof value !== 'string') return value;
        try {
            return JSON.parse(value);
        } catch (err) {
            throw invalidInput(z, `"${entry.label}" isn't valid JSON: ${err.message}`);
        }
    }
    return convertScalar(z, entry.kind, value, `"${entry.label}"`);
};

/**
 * A documented endpoint's request, from its typed field values. Only the keys of `entries` are read: Zapier keeps the
 * values of other endpoints and of Custom path under "Extra Fields" and sends them, and they must not leak in.
 */
const buildEndpointRequest = (z, { method, path }, entries, inputData) => {
    const filled = entries
        .map((entry) => ({ entry, value: convertFieldValue(z, entry, inputData[entry.key]) }))
        .filter(({ value }) => value !== undefined);

    // Zapier checks required fields in the editor, but a mapped value can still be empty when the Zap runs.
    const filledEntries = new Set(filled.map(({ entry }) => entry));
    const isBodyFilled = filled.some(({ entry }) => entry.location === 'body');
    entries.forEach((entry) => {
        if (filledEntries.has(entry)) return;
        if (entry.required) throw invalidInput(z, `Fill in "${entry.label}".`);
        if (entry.requiredInBody && isBodyFilled) throw invalidInput(z, `Fill in "${entry.label}", or leave all body fields empty.`);
    });

    const pathValues = new Map();
    const query = [];
    let body;
    filled.forEach(({ entry, value }) => {
        if (entry.location === 'path') pathValues.set(entry.name, { value: String(value), label: entry.label });
        else if (entry.location === 'query') query.push({ name: entry.name, value, style: entry.style, explode: entry.explode });
        else if (entry.location === 'wholeBody') body = value;
        else body = { ...body, [entry.name]: value };
    });
    // A required body is sent even when all its fields are empty. An optional one is left out: `{}` could lack the
    // properties its schema requires, and the server would refuse it.
    if (body === undefined && entries.some(({ bodyRequired }) => bodyRequired)) body = {};

    const filledPath = path.replace(/\{([^}]+)\}/g, (placeholder, name) => {
        if (!pathValues.has(name)) throw invalidInput(z, `Fill in the path parameter "${name}".`);
        const { value, label } = pathValues.get(name);
        // The URL would resolve `.` and `..` as path segments and send the request to another endpoint.
        if (value === '.' || value === '..') throw invalidInput(z, `"${label}" can't be "${value}".`);
        return encodeURIComponent(value);
    });

    return { method, path: filledPath, query, body: method === 'GET' ? undefined : body };
};

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

// A nested object or array has no OpenAPI serialization in a query, so it is sent as JSON.
const toQueryText = (value) => (typeof value === 'object' && value !== null ? JSON.stringify(value) : String(value));

// What joins the items of an array that isn't exploded. Objects are always joined with commas.
const ARRAY_DELIMITERS = { spaceDelimited: ' ', pipeDelimited: '|' };

/**
 * Adds a query parameter as its OpenAPI `style` and `explode` say. Style form with explode, the default: `?a=1&a=2` for
 * an array and `?color=red&size=L` for an object. Without explode: `?a=1,2` and `?filter=color,red,size,L`. Style
 * deepObject: `?filter[color]=red`. Custom path's parameters are scalars with explode.
 */
const appendQueryParameter = (params, { name, value, style, explode }) => {
    if (isObject(value)) {
        const pairs = Object.entries(value);
        if (style === 'deepObject') pairs.forEach(([key, item]) => params.append(`${name}[${key}]`, toQueryText(item)));
        else if (explode) pairs.forEach(([key, item]) => params.append(key, toQueryText(item)));
        else params.append(name, pairs.flat().map(toQueryText).join(','));
    } else if (Array.isArray(value) && !explode) {
        params.append(name, value.map(toQueryText).join(ARRAY_DELIMITERS[style] || ','));
    } else {
        (Array.isArray(value) ? value : [value]).forEach((item) => params.append(name, toQueryText(item)));
    }
};

/** The request URL: the Actor's origin, the path, then the query parameters after any query already in the path. */
const buildRequestUrl = (z, origin, { path, query }) => {
    let url;
    try {
        url = new URL(`${origin}${path}`);
    } catch (err) {
        throw invalidInput(z, `"${path}" isn't a valid path.`);
    }

    const params = new URLSearchParams();
    query.forEach((parameter) => appendQueryParameter(params, parameter));
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

const APIFY_STORE_HOSTS = ['apify.com', 'www.apify.com'];
const APIFY_CONSOLE_HOST = 'console.apify.com';

/** The Actor from an Apify Store or Console URL, or `undefined` for any other URL. */
const parseActorUrl = (text) => {
    let url;
    try {
        url = new URL(text);
    } catch (err) {
        return undefined;
    }
    const [first, second] = url.pathname.split('/').filter(Boolean);
    if (APIFY_STORE_HOSTS.includes(url.hostname) && first && second) return `${first}~${second}`;
    if (url.hostname === APIFY_CONSOLE_HOST && first === 'actors' && second && second !== 'tasks') return second;
    return undefined;
};

/**
 * The Actor ID from the Actor field. It takes an ID or `username~name` as they are, `username/name` as
 * `username~name`, an Apify Store URL (`https://apify.com/<username>/<name>`) and an Apify Console URL
 * (`https://console.apify.com/actors/<id>/...`). Returns `''` when the field is empty, and `undefined` for any other
 * URL or a value that can't be an ID or name.
 */
const parseActorReference = (value) => {
    const text = typeof value === 'string' ? value.trim() : '';
    if (!text) return '';
    const actorId = /^[a-z][a-z\d+.-]*:\/\//i.test(text) ? parseActorUrl(text) : text.replace(/^([^/]+)\/([^/]+)$/, '$1~$2');
    // The ID becomes a segment of the API URL path, where "." and ".." would be resolved as dot segments.
    return isValidApiPathSegment(actorId) ? actorId : undefined;
};

const getActorUrl = (actorId) => `${APIFY_API_ENDPOINTS.actors}/${encodeURIComponent(actorId)}`;

/**
 * Looks up the Actor and what its server offers, from GET /v2/acts/{id} and its default build:
 * - `notFound`: the Actor doesn't exist, or the account can't access it.
 * - `noServer`: no server interface.
 * - `mcpOnly`: the build sets `webServerMcpPath`, and its OpenAPI document, if any, lists no endpoints. Not called.
 * - `rest`: everything else, with the OpenAPI document and its endpoints, which may be none.
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

    const { data: build } = await wrapRequestWithRetries(z.request, { url: `${getActorUrl(actor.id || actorId)}/builds/default` });
    const definition = build && isObject(build.actorDefinition) ? build.actorDefinition : {};
    const document = parseOpenApiDocument(definition.webServerSchema);
    const endpoints = parseOpenApiEndpoints(document);
    if (!endpoints.length && definition.webServerMcpPath) return { type: 'mcpOnly', actor };

    return { type: 'rest', actor, origin, document, endpoints };
};

module.exports = {
    CUSTOM_ENDPOINT,
    FIELD_KEYS,
    HTTP_METHODS,
    MESSAGES,
    buildCustomRequest,
    buildEndpointRequest,
    buildRequestUrl,
    decodeResponseBody,
    escapeMarkdown,
    getEndpointEntries,
    getEndpointInputFields,
    getErrorFromBody,
    getErrorMessage,
    getNoOpenApiMessage,
    getServerActorInterface,
    getServerActorOrigin,
    getStaleEndpointMessage,
    invalidInput,
    parseActorReference,
    parseEndpointValue,
    parseOpenApiDocument,
    parseOpenApiEndpoints,
    requestTiming,
    resolveRefs,
    sendServerActorRequest,
    toResult,
};
