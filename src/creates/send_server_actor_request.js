const { SEND_SERVER_ACTOR_REQUEST_SAMPLE, SEND_SERVER_ACTOR_REQUEST_OUTPUT_FIELDS } = require('../consts');
const { getActorNotFoundMessage } = require('../apify_helpers');
const {
    FIELD_KEYS,
    HTTP_METHODS,
    MESSAGES,
    buildCustomRequest,
    buildRequestUrl,
    getServerActorInterface,
    invalidInput,
    parseActorReference,
    sendServerActorRequest,
    toResult,
} = require('../server_actor');

/**
 * Sends one HTTP request to a Server Actor and returns its response, without starting a run. See src/server_actor.js
 * for why the request is never sent twice.
 */

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

const sendRequest = async (z, bundle) => {
    const stepStartedAt = Date.now();
    const { inputData } = bundle;

    // Checked before any lookup, so an invalid Actor fails fast and sends nothing.
    const actorId = parseActorReference(inputData.actorId);
    if (actorId === undefined) throw invalidInput(z, MESSAGES.invalidActor);
    if (!actorId) throw invalidInput(z, MESSAGES.noActor);

    const serverActor = await getServerActorInterface(z, actorId);
    if (serverActor.type === 'notFound') throw new z.errors.Error(getActorNotFoundMessage(actorId), 'NotFound', 404);
    if (serverActor.type === 'noServer') throw invalidInput(z, MESSAGES.noServerInterface);

    const request = buildCustomRequest(z, inputData);
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
                helpText: 'Choose a Server Actor, or enter an Actor ID or `username~name`. Zapier stops a step after 30 seconds, '
                    + 'so the Actor must answer within about 25 seconds.',
                key: FIELD_KEYS.actorId,
                required: true,
                dynamic: 'actorsWithStore.id.name',
            },
            ...CUSTOM_PATH_FIELDS,
        ],

        perform: sendRequest,

        sample: SEND_SERVER_ACTOR_REQUEST_SAMPLE,
        outputFields: SEND_SERVER_ACTOR_REQUEST_OUTPUT_FIELDS,
    },
};
