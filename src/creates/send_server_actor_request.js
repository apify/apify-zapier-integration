const { SEND_SERVER_ACTOR_REQUEST_SAMPLE, SEND_SERVER_ACTOR_REQUEST_OUTPUT_FIELDS } = require('../consts');
const { getActorNotFoundMessage } = require('../apify_helpers');
const {
    CUSTOM_ENDPOINT,
    FIELD_KEYS,
    HTTP_METHODS,
    MESSAGES,
    buildCustomRequest,
    buildEndpointRequest,
    buildRequestUrl,
    escapeMarkdown,
    getEndpointEntries,
    getEndpointInputFields,
    getErrorMessage,
    getNoOpenApiMessage,
    getServerActorInterface,
    getStaleEndpointMessage,
    invalidInput,
    parseActorReference,
    parseEndpointValue,
    sendServerActorRequest,
    toResult,
} = require('../server_actor');

/**
 * Sends one HTTP request to a Server Actor and returns its response, without starting a run. See src/server_actor.js
 * for why the request is never sent twice.
 */

const getEndpointValue = (inputData) => (typeof inputData.endpoint === 'string' ? inputData.endpoint.trim() : '');

const actorNotice = (helpText) => ({ key: 'serverActorNotice', label: 'Server Actor', type: 'copy', helpText });

const endpointNotice = (helpText) => ({ key: 'endpointNotice', label: 'Endpoint parameters', type: 'copy', helpText });

const getEndpointField = (endpoints) => ({
    key: FIELD_KEYS.endpoint,
    label: 'Endpoint',
    helpText: endpoints.length
        ? 'The endpoint to send the request to, from the Actor\'s OpenAPI definition. Choose **Custom path** to enter the method '
            + 'and path yourself.'
        : 'Choose **Custom path** to enter the method and path.',
    required: true,
    altersDynamicFields: true,
    // A saved endpoint of another Actor is cleared. `perform` checks the endpoint against the Actor's OpenAPI anyway.
    dependsOn: [FIELD_KEYS.actorId],
    choices: [
        ...endpoints.map(({ value, label }) => ({ value, label, sample: value })),
        { value: CUSTOM_ENDPOINT, label: 'Custom path', sample: CUSTOM_ENDPOINT },
    ],
});

const CUSTOM_PATH_FIELDS = [
    {
        key: FIELD_KEYS.customMethod,
        label: 'Method',
        required: true,
        default: 'GET',
        choices: HTTP_METHODS,
    },
    {
        key: FIELD_KEYS.customPath,
        label: 'Path',
        helpText: 'The path on the Actor\'s server, e.g. `/search`. It can include a query string. The host can\'t be changed.',
        required: true,
        type: 'string',
        placeholder: '/search',
    },
    {
        key: FIELD_KEYS.customQuery,
        label: 'Query parameters',
        helpText: 'Added to the URL after any query string in **Path**.',
        required: false,
        dict: true,
    },
    {
        key: FIELD_KEYS.customBody,
        label: 'Body (JSON)',
        helpText: 'The request body, as a JSON object or array. It isn\'t sent with GET.',
        required: false,
        type: 'text',
    },
];

/**
 * The fields after the Actor: what the Actor's server offers, the Endpoint dropdown, and the chosen endpoint's typed
 * parameters or the Custom path fields. The Zap editor doesn't show errors thrown here, so problems are shown as
 * read-only `copy` fields, and `perform` throws the same message.
 */
const getEndpointFields = async (z, bundle) => {
    const actorId = parseActorReference(bundle.inputData.actorId);
    if (actorId === undefined) return [actorNotice(MESSAGES.invalidActor)];
    if (!actorId) {
        // While the editor loads fields, an Actor mapped from an earlier step is missing from `inputData`, and
        // `inputDataRaw` is empty, so it can't be told from no Actor. Its endpoints can't be listed, but Custom path
        // works with whatever Actor the step gets. `dependsOn` keeps Endpoint disabled until the Actor is set.
        const endpointValue = getEndpointValue(bundle.inputData);
        return [
            actorNotice(MESSAGES.selectActor),
            getEndpointField([]),
            ...(endpointValue === CUSTOM_ENDPOINT ? CUSTOM_PATH_FIELDS : []),
        ];
    }

    let serverActor;
    try {
        serverActor = await getServerActorInterface(z, actorId);
    } catch (err) {
        return [actorNotice(`Couldn't load the Actor's endpoints: ${escapeMarkdown(getErrorMessage(err))}`)];
    }
    if (serverActor.type === 'notFound') return [actorNotice(escapeMarkdown(getActorNotFoundMessage(actorId)))];
    if (serverActor.type === 'noServer') return [actorNotice(MESSAGES.noServerInterface)];
    if (serverActor.type === 'mcpOnly') return [actorNotice(MESSAGES.mcpOnly)];

    const { actor, document, endpoints } = serverActor;
    const fields = [
        ...(endpoints.length ? [] : [actorNotice(getNoOpenApiMessage(actor.id || actorId))]),
        getEndpointField(endpoints),
    ];

    const endpointValue = getEndpointValue(bundle.inputData);
    if (!endpointValue) return fields;
    if (endpointValue === CUSTOM_ENDPOINT) return [...fields, ...CUSTOM_PATH_FIELDS];

    const endpoint = parseEndpointValue(endpointValue);
    if (!endpoint || !endpoints.some(({ value }) => value === endpointValue)) {
        return [...fields, endpointNotice(getStaleEndpointMessage(escapeMarkdown(endpointValue)))];
    }

    const parameterFields = getEndpointInputFields(document, endpoint.method, endpoint.path);
    return [...fields, ...(parameterFields.length ? parameterFields : [endpointNotice(MESSAGES.noParameters)])];
};

const sendRequest = async (z, bundle) => {
    const stepStartedAt = Date.now();
    const { inputData } = bundle;

    // Checked before any lookup, so a step without an endpoint fails fast and sends nothing.
    const actorId = parseActorReference(inputData.actorId);
    if (actorId === undefined) throw invalidInput(z, MESSAGES.invalidActor);
    if (!actorId) throw invalidInput(z, MESSAGES.noActor);
    const endpointValue = getEndpointValue(inputData);
    if (!endpointValue) throw invalidInput(z, MESSAGES.noEndpoint);
    const isCustom = endpointValue === CUSTOM_ENDPOINT;
    const endpoint = isCustom ? undefined : parseEndpointValue(endpointValue);
    if (!isCustom && !endpoint) throw invalidInput(z, getStaleEndpointMessage(endpointValue));

    const serverActor = await getServerActorInterface(z, actorId);
    if (serverActor.type === 'notFound') throw new z.errors.Error(getActorNotFoundMessage(actorId), 'NotFound', 404);
    if (serverActor.type === 'noServer') throw invalidInput(z, MESSAGES.noServerInterface);
    if (serverActor.type === 'mcpOnly') throw invalidInput(z, MESSAGES.mcpOnly);

    let request;
    if (isCustom) {
        request = buildCustomRequest(z, inputData);
    } else {
        // After the Actor is changed, a saved endpoint of the previous Actor would otherwise go to the new one.
        if (!serverActor.endpoints.some(({ value }) => value === endpointValue)) {
            throw invalidInput(z, getStaleEndpointMessage(endpointValue));
        }
        const entries = getEndpointEntries(serverActor.document, endpoint.method, endpoint.path);
        request = buildEndpointRequest(z, endpoint, entries, inputData);
    }

    const url = buildRequestUrl(z, serverActor.origin, request);
    const response = await sendServerActorRequest(z, { url, method: request.method, body: request.body }, stepStartedAt);
    return toResult(z, response);
};

module.exports = {
    key: 'sendServerActorRequest',
    noun: 'Request',
    display: {
        label: 'Send Server Actor Request',
        description: 'Sends one request to a Server Actor and returns its response, without starting a run. '
            + 'To start a run, use Run Actor instead.',
    },
    operation: {
        inputFields: [
            {
                label: 'Actor',
                helpText: 'Choose a Server Actor from Apify Store, or enter an Actor ID, `username~name` or the Actor\'s Apify Store '
                    + 'URL. Private Server Actors aren\'t in the list. Zapier stops a step after 30 seconds, so the Actor must '
                    + 'answer within about 25 seconds.',
                key: FIELD_KEYS.actorId,
                required: true,
                altersDynamicFields: true,
                dynamic: 'serverActors.id.name',
            },
            getEndpointFields,
        ],

        perform: sendRequest,

        sample: SEND_SERVER_ACTOR_REQUEST_SAMPLE,
        outputFields: SEND_SERVER_ACTOR_REQUEST_OUTPUT_FIELDS,
    },
};
