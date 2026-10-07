/**
 * SPIKE: Server Actor ("Endpoint" interface) support for the Run Actor action.
 *
 * Server Actors have the server interface enabled (`actorStandby.isEnabled`; the API keeps the old
 * "standby" names). They answer HTTP requests at their `standbyUrl` instead of starting a run.
 * API logic mirrors the n8n spike (n8n-nodes-apify@4b5c59d, nodes/Apify/resources/serverActor.ts):
 * - "is it a Server Actor" = `actorStandby.isEnabled` on GET /v2/acts/{id}
 * - REST vs MCP = `actorDefinition.webServerSchema` / `webServerMcpPath` on GET /v2/acts/{id}/builds/default
 * - URL = `standbyUrl` + path, auth = `Authorization: Bearer <token>`
 * Only the UI layer differs: Zapier builds the form from dynamic field functions.
 */
const { APIFY_API_ENDPOINTS } = require('./consts');
const { wrapRequestWithRetries, isServerActorUrl } = require('./request_helpers');

const INTERFACE_FIELD_KEY = 'actorInterface';
const INTERFACES = { INPUT: 'input', ENDPOINT: 'endpoint' };
const ENDPOINT_FIELD_KEY = 'serverEndpoint';
const CUSTOM_ENDPOINT = '__custom__';
const ENDPOINT_ACTOR_REFERENCE_KEY = 'serverEndpointActorId';

// Typed param fields generated from OpenAPI get one of these key prefixes.
const PARAM_PREFIX = { query: 'saQuery_', path: 'saPath_', body: 'saBody_' };
const RAW_QUERY_KEY = 'saRawQuery';
const RAW_BODY_KEY = 'saRawBody';
const CUSTOM_METHOD_KEY = 'saCustomMethod';
const CUSTOM_PATH_KEY = 'saCustomPath';

const HTTP_METHODS = ['get', 'post', 'put', 'patch', 'delete'];
const HIDDEN_PATHS = new Set(['/health', '/healthz', '/openapi.json', '/openapi.yaml', '/docs', '/favicon.ico', '/robots.txt']);
// The platform cuts off requests that get no first byte after 300 s (FINDINGS.md §6).
const REQUEST_TIMEOUT_MILLIS = 300 * 1000;
const HELP_TEXT_MAX = 1000;

const truncate = (text, max = HELP_TEXT_MAX) => {
    if (!text) return undefined;
    const str = String(text);
    return str.length > max ? `${str.slice(0, max - 1)}…` : str;
};

/** Resolves a local `$ref` (`#/components/...`, also deep ones like `.../properties/url`). */
const resolveRef = (doc, node, depth = 0) => {
    if (!node || typeof node !== 'object' || !node.$ref || depth > 10) return node;
    const ref = String(node.$ref);
    if (!ref.startsWith('#/')) return {};
    const target = ref.slice(2).split('/').reduce((acc, part) => {
        const key = part.replace(/~1/g, '/').replace(/~0/g, '~');
        return acc && typeof acc === 'object' ? acc[key] : undefined;
    }, doc);
    const { $ref, ...siblings } = node;
    return { ...resolveRef(doc, target, depth + 1), ...siblings };
};

const parseDocument = (schema) => {
    if (typeof schema !== 'string') return schema && typeof schema === 'object' ? schema : undefined;
    try {
        return JSON.parse(schema);
    } catch (err) {
        return undefined;
    }
};

/** Lists `{ value: 'GET /path', label, method, path, operation, pathItem }` from an OpenAPI document. */
const parseOpenApiEndpoints = (schema) => {
    const doc = parseDocument(schema);
    if (!doc || !doc.paths || typeof doc.paths !== 'object') return [];
    const endpoints = [];
    Object.entries(doc.paths).forEach(([path, rawPathItem]) => {
        if (HIDDEN_PATHS.has(path) || !rawPathItem || typeof rawPathItem !== 'object') return;
        const pathItem = resolveRef(doc, rawPathItem);
        HTTP_METHODS.forEach((method) => {
            const operation = pathItem[method];
            if (!operation) return;
            const value = `${method.toUpperCase()} ${path}`;
            const summary = operation.summary || operation.description;
            endpoints.push({
                value,
                label: summary ? `${value} - ${truncate(summary, 80)}` : value,
                method: method.toUpperCase(),
                path,
                operation,
                pathItem,
            });
        });
    });
    return endpoints;
};

/** Loads what the form and perform need to know about the Actor's server interface. */
const getServerActorInfo = async (z, actorId) => {
    const { data: actor } = await wrapRequestWithRetries(z.request, { url: `${APIFY_API_ENDPOINTS.actors}/${actorId}` });
    const isServer = Boolean(actor && actor.actorStandby && actor.actorStandby.isEnabled && actor.standbyUrl);
    if (!isServer) return { isServer: false, actor };

    let actorDefinition = {};
    try {
        const { data: build } = await wrapRequestWithRetries(z.request, { url: `${APIFY_API_ENDPOINTS.actors}/${actorId}/builds/default` });
        actorDefinition = (build && build.actorDefinition) || {};
    } catch (err) {
        z.console.error('Could not load the default build of a Server Actor', err);
    }
    const openApi = parseDocument(actorDefinition.webServerSchema);
    const endpoints = parseOpenApiEndpoints(openApi);
    return {
        isServer: true,
        actor,
        standbyUrl: String(actor.standbyUrl).replace(/\/$/, ''),
        openApi,
        endpoints,
        mcpPath: actorDefinition.webServerMcpPath,
    };
};

/** Maps one OpenAPI schema (param or body property) to a Zapier input field. */
const schemaToField = (doc, key, name, rawSchema, { required, description, example } = {}) => {
    const schema = resolveRef(doc, rawSchema || {}) || {};
    const field = {
        key,
        label: name,
        required: Boolean(required),
        helpText: truncate(description || schema.description),
    };
    if (schema.default !== undefined && typeof schema.default !== 'object') field.default = String(schema.default);
    const exampleValue = example !== undefined ? example : schema.example;
    if (exampleValue !== undefined && typeof exampleValue !== 'object') field.placeholder = String(exampleValue);

    const itemSchema = schema.type === 'array' ? resolveRef(doc, schema.items || {}) : undefined;
    switch (schema.type) {
        case 'integer':
            field.type = 'integer';
            break;
        case 'number':
            field.type = 'number';
            break;
        case 'boolean':
            field.type = 'boolean';
            break;
        case 'array':
            if (itemSchema && ['string', 'integer', 'number'].includes(itemSchema.type)) {
                field.type = 'string';
                field.list = true;
                if (Array.isArray(itemSchema.enum)) field.choices = itemSchema.enum.map(String);
            } else {
                field.type = 'text';
                field.helpText = truncate(`${field.helpText || ''} (JSON array)`.trim());
            }
            break;
        case 'object':
            if (schema.additionalProperties && !schema.properties) {
                field.dict = true; // key/value pairs, e.g. headers
            } else {
                field.type = 'text';
                field.helpText = truncate(`${field.helpText || ''} (JSON object)`.trim());
            }
            break;
        default:
            field.type = 'string';
            if (Array.isArray(schema.enum)) field.choices = schema.enum.map(String);
    }
    field.meta = { saType: schema.type || 'string' };
    if (!field.helpText) delete field.helpText;
    return field;
};

/** Typed fields for the endpoint's path/query params and JSON body properties. */
const fieldsForEndpoint = (doc, endpoint) => {
    const fields = [];
    const params = [...(endpoint.pathItem.parameters || []), ...(endpoint.operation.parameters || [])]
        .map((param) => resolveRef(doc, param))
        .filter((param) => param && ['query', 'path'].includes(param.in));
    params.forEach((param) => {
        const field = schemaToField(doc, `${PARAM_PREFIX[param.in]}${param.name}`, param.name, param.schema, {
            required: param.in === 'path' || param.required,
            description: param.description,
            example: param.example,
        });
        // OpenAPI query arrays default to style=form, explode=true (repeated keys); explode=false means comma-joined.
        if (param.in === 'query' && param.explode === false) field.meta.saExplode = false;
        fields.push(field);
    });

    if (endpoint.method !== 'GET' && endpoint.operation.requestBody) {
        const requestBody = resolveRef(doc, endpoint.operation.requestBody);
        const jsonContent = requestBody.content && requestBody.content['application/json'];
        const bodySchema = jsonContent && resolveRef(doc, jsonContent.schema || {});
        if (bodySchema && bodySchema.type === 'object' && bodySchema.properties) {
            const required = new Set(bodySchema.required || []);
            fields.push({ key: 'saBodyHeading', type: 'copy', helpText: '**Request body** (JSON) fields:' });
            Object.entries(bodySchema.properties).forEach(([name, propSchema]) => {
                fields.push(schemaToField(doc, `${PARAM_PREFIX.body}${name}`, name, propSchema, { required: required.has(name) }));
            });
        } else {
            fields.push({ key: RAW_BODY_KEY, label: 'Body (JSON)', type: 'text', required: Boolean(requestBody.required) });
        }
    }
    return fields;
};

const customEndpointFields = () => [
    {
        key: CUSTOM_METHOD_KEY,
        label: 'Method',
        required: true,
        default: 'GET',
        choices: HTTP_METHODS.map((m) => m.toUpperCase()),
    },
    { key: CUSTOM_PATH_KEY, label: 'Path', required: true, default: '/', helpText: 'Path on the Actor\'s server URL, e.g. `/search`.' },
    { key: RAW_QUERY_KEY, label: 'Query parameters', dict: true, required: false },
    { key: RAW_BODY_KEY, label: 'Body (JSON)', type: 'text', required: false, helpText: 'JSON request body. Ignored for GET.' },
];

const noInterfaceField = (helpText) => ({ key: 'saNoServerInterface', label: 'No server interface', type: 'copy', helpText });

/** Dynamic input fields shown when Interface = Endpoint. */
const getEndpointFields = async (z, bundle) => {
    const { actorId } = bundle.inputData;
    if (!actorId) return [];

    const info = await getServerActorInfo(z, actorId);
    if (!info.isServer) {
        return [noInterfaceField('⚠️ **This Actor has no server interface**, so it has no endpoints to call. '
            + 'Switch **Interface** to **Input** to start a run instead.')];
    }

    // A changed Actor invalidates the previously chosen endpoint.
    const actorChanged = bundle.inputData[ENDPOINT_ACTOR_REFERENCE_KEY] && bundle.inputData[ENDPOINT_ACTOR_REFERENCE_KEY] !== actorId;
    const selected = actorChanged ? undefined : bundle.inputData[ENDPOINT_FIELD_KEY];

    const fields = [
        { key: ENDPOINT_ACTOR_REFERENCE_KEY, label: 'Endpoint Actor ID', type: 'string', default: actorId, computed: true },
    ];

    if (info.mcpPath && !info.endpoints.length) {
        fields.push(noInterfaceField(`This Actor is an **MCP server** (\`${info.mcpPath}\`), not a REST API. `
            + 'Calling MCP tools is not supported by this action. You can still pick **Custom path** to send a raw request.'));
    } else if (!info.endpoints.length) {
        fields.push({
            key: 'saNoOpenApi',
            type: 'copy',
            helpText: 'This Actor does not publish an OpenAPI definition. Choose **Custom path** and take the method and path from its README.',
        });
    }

    fields.push({
        key: ENDPOINT_FIELD_KEY,
        label: 'Endpoint',
        helpText: 'The endpoint to call, from the Actor\'s OpenAPI definition. The response comes back directly, no run is started.',
        required: true,
        altersDynamicFields: true,
        choices: [
            ...info.endpoints.map(({ value, label }) => ({ value, label, sample: value })),
            { value: CUSTOM_ENDPOINT, label: 'Custom path…', sample: CUSTOM_ENDPOINT },
        ],
    });

    if (selected === CUSTOM_ENDPOINT) {
        fields.push(...customEndpointFields());
    } else if (selected) {
        const endpoint = info.endpoints.find((e) => e.value === selected);
        if (endpoint) fields.push(...fieldsForEndpoint(info.openApi, endpoint));
    }
    return fields;
};

const parseJson = (value, label) => {
    if (value === undefined || value === null || value === '') return undefined;
    if (typeof value === 'object') return value;
    try {
        return JSON.parse(value);
    } catch (err) {
        throw new Error(`${label} is not valid JSON: ${err.message}`);
    }
};

/** Converts a field value back to what the OpenAPI schema expects. */
const coerceValue = (value, field, label) => {
    const saType = field && field.meta && field.meta.saType;
    if (saType === 'object' && !field.dict) return parseJson(value, label);
    if (saType === 'array' && !field.list) return parseJson(value, label);
    if (saType === 'integer') return parseInt(value, 10);
    if (saType === 'number') return Number(value);
    if (saType === 'boolean') return value === true || value === 'true' || value === 'yes';
    return value;
};

const isEmpty = (value) => value === undefined || value === null || value === '' || (Array.isArray(value) && value.length === 0);

const errorMessageFromResponse = (response) => {
    let body = response.data;
    if (body === undefined || typeof body === 'string') body = parseDocument(response.content) || response.content;
    if (body && typeof body === 'object') {
        if (typeof body.error === 'string') return body.code ? `${body.error} (code: ${body.code})` : body.error; // Actor's own shape
        if (body.error && body.error.message) return `${body.error.message} (${body.error.type})`; // platform shape
    }
    const text = typeof body === 'string' ? body.trim() : '';
    return text ? text.slice(0, 500) : `Server Actor responded with HTTP ${response.status}`;
};

/** Perform for Interface = Endpoint. Returns `{ status, contentType, body }`. */
const callServerActorEndpoint = async (z, bundle) => {
    const { actorId } = bundle.inputData;
    const selected = bundle.inputData[ENDPOINT_FIELD_KEY];
    if (!selected) throw new z.errors.Error('Choose an endpoint. If there are none, the Actor has no server interface.', 'InvalidInput', 400);

    const info = await getServerActorInfo(z, actorId);
    if (!info.isServer) {
        throw new z.errors.Error('This Actor has no server interface. Set Interface to "Input" to start a run instead.', 'NoServerInterface', 400);
    }

    let method;
    let path;
    let query = {};
    let body;
    if (selected === CUSTOM_ENDPOINT) {
        method = (bundle.inputData[CUSTOM_METHOD_KEY] || 'GET').toUpperCase();
        path = bundle.inputData[CUSTOM_PATH_KEY] || '/';
        query = { ...(bundle.inputData[RAW_QUERY_KEY] || {}) };
        body = parseJson(bundle.inputData[RAW_BODY_KEY], 'Body');
    } else {
        const endpoint = info.endpoints.find((e) => e.value === selected);
        if (!endpoint) {
            throw new z.errors.Error(`The endpoint "${selected}" is no longer in the Actor's OpenAPI definition.`, 'EndpointNotFound', 400);
        }
        ({ method, path } = endpoint);
        const fieldsByKey = Object.fromEntries(fieldsForEndpoint(info.openApi, endpoint).map((f) => [f.key, f]));
        const bodyObject = {};
        Object.entries(bundle.inputData).forEach(([key, value]) => {
            const field = fieldsByKey[key];
            if (!field || isEmpty(value)) return;
            const coerced = coerceValue(value, field, field.label);
            if (key.startsWith(PARAM_PREFIX.query)) {
                const joined = Array.isArray(coerced) && field.meta.saExplode === false ? coerced.join(',') : coerced;
                query[key.slice(PARAM_PREFIX.query.length)] = joined;
            } else if (key.startsWith(PARAM_PREFIX.path)) {
                path = path.replace(`{${key.slice(PARAM_PREFIX.path.length)}}`, encodeURIComponent(String(coerced)));
            } else if (key.startsWith(PARAM_PREFIX.body)) bodyObject[key.slice(PARAM_PREFIX.body.length)] = coerced;
        });
        if (Object.keys(bodyObject).length) body = bodyObject;
        if (bundle.inputData[RAW_BODY_KEY]) body = parseJson(bundle.inputData[RAW_BODY_KEY], 'Body');
    }
    if (!path.startsWith('/')) path = `/${path}`;
    const missing = path.match(/\{([^}]+)\}/);
    if (missing) throw new z.errors.Error(`Missing value for path parameter "${missing[1]}".`, 'InvalidInput', 400);

    const url = new URL(`${info.standbyUrl}${path}`);
    Object.entries(query).forEach(([key, value]) => {
        if (isEmpty(value)) return;
        if (Array.isArray(value)) value.forEach((v) => url.searchParams.append(key, String(v)));
        else url.searchParams.set(key, typeof value === 'object' ? JSON.stringify(value) : String(value));
    });

    // No wrapRequestWithRetries: a Server Actor may charge per request, so a retry could charge twice.
    const response = await z.request({
        url: url.toString(),
        method,
        headers: {
            Authorization: `Bearer ${bundle.authData.access_token}`,
            'x-apify-integration-platform': 'zapier',
            ...(body !== undefined && method !== 'GET' ? { 'Content-Type': 'application/json' } : {}),
        },
        body: body !== undefined && method !== 'GET' ? JSON.stringify(body) : undefined,
        timeout: REQUEST_TIMEOUT_MILLIS,
        skipThrowForStatus: true,
    });

    if (response.status >= 400) {
        throw new z.errors.Error(errorMessageFromResponse(response), 'ServerActorError', response.status);
    }

    const contentType = ((response.headers && response.headers.get && response.headers.get('content-type')) || '').split(';')[0] || null;
    let responseBody = response.content;
    if (contentType && contentType.includes('json')) {
        const parsed = parseDocument(response.content);
        if (parsed !== undefined) responseBody = parsed;
    }
    return {
        status: response.status,
        contentType,
        method,
        url: url.origin + url.pathname,
        body: responseBody === '' ? null : responseBody,
    };
};

const ENDPOINT_OUTPUT_FIELDS = [
    { key: 'status', label: 'HTTP status', type: 'integer' },
    { key: 'contentType', label: 'Content type', type: 'string' },
    { key: 'method', label: 'Method', type: 'string' },
    { key: 'url', label: 'URL', type: 'string' },
    { key: 'body', label: 'Response body' },
];

const isEndpointInterface = (bundle) => bundle.inputData[INTERFACE_FIELD_KEY] === INTERFACES.ENDPOINT;

module.exports = {
    INTERFACE_FIELD_KEY,
    INTERFACES,
    ENDPOINT_FIELD_KEY,
    CUSTOM_ENDPOINT,
    ENDPOINT_OUTPUT_FIELDS,
    isServerActorUrl,
    isEndpointInterface,
    resolveRef,
    parseOpenApiEndpoints,
    getServerActorInfo,
    getEndpointFields,
    fieldsForEndpoint,
    callServerActorEndpoint,
};
