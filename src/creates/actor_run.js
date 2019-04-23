const { BUILD_TAG_LATEST } = require('apify-shared/consts');
const { APIFY_API_ENDPOINTS, ACTOR_RUN_SAMPLE, ACTOR_RUN_OUTPUT_FIELDS } = require('../consts');
const { enrichActorRun } = require('../apify_helpers');
const { wrapRequestWithRetries } = require('../request_helpers');

const runActor = async (z, bundle) => {
    const { actorId, runSync, inputBody, inputContentType, build, timeoutSecs, memoryMbytes } = bundle.inputData;

    const requestOpts = {
        url: `${APIFY_API_ENDPOINTS.actors}/${actorId}/runs`,
        method: 'POST',
        params: {
            build,
            timeout: timeoutSecs,
            memory: memoryMbytes,
        },
    };

    if (runSync) requestOpts.params.waitForFinish = 120;
    if (inputContentType) {
        requestOpts.headers = {
            'Content-Type': inputContentType,
        };
    }
    if (inputBody) requestOpts.body = inputBody;

    const runResponse = await wrapRequestWithRetries(z.request, requestOpts);

    let run = runResponse.json;
    if (runSync) {
        run = await enrichActorRun(z, run);
    }

    return run;
};

/**
 * This method loads additional input fields regarding actor default values.
 */
const getActorAdditionalFields = async (z, bundle) => {
    const { actorId } = bundle.inputData;
    if (!actorId) return [];

    const actor = await wrapRequestWithRetries(z.request, {
        url: `${APIFY_API_ENDPOINTS.actors}/${actorId}`,
    });
    /*
    TODO: We need to fetch input schema and prefill input regarding that. But we need to have
    input schema in build detail API. Now we use just defaultRunOptions, exampleRunInput.
     */

    const { body, contentType } = actor.exampleRunInput;
    const { build, timeoutSecs, memoryMbytes } = actor.defaultRunOptions;
    const defaultActorBuildTag = build || BUILD_TAG_LATEST;

    // Try to parse JSON body
    let jsonInput;
    if (contentType.includes('application/json')) {
        try {
            jsonInput = JSON.parse(body);
        } catch (err) {
            // There can be invalid JSON, but show must go on.
        }
    }

    return [
        {
            label: 'Input body',
            helpText: 'Input data for actor.',
            key: 'inputBody',
            required: false,
            default: jsonInput ? JSON.stringify(jsonInput, null, 2) : body,
            type: 'text', // NICE TO HAVE: Input type 'file' regarding content type
        },
        {
            label: 'Input content type',
            helpText: 'Content type for actor input body.',
            key: 'inputContentType',
            required: false,
            default: contentType || '',
            type: 'string',
        },
        {
            label: 'Build',
            helpText: 'Tag or number of the build that you want to run. It can be something like latest, beta or 1.2.34.',
            key: 'build',
            required: false,
            default: defaultActorBuildTag,
            type: 'string',
        },
        {
            label: 'Timeout',
            helpText: 'Timeout for the actor run in seconds. Zero value means there is no timeout and the actor runs until completion.',
            key: 'timeoutSecs',
            required: false,
            default: timeoutSecs || 0,
            type: 'integer',
        },
        {
            label: 'Memory',
            helpText: 'Amount of memory allocated for the actor run, in megabytes.',
            key: 'memoryMbytes',
            required: false,
            default: memoryMbytes || 1024,
            type: 'integer',
        },
    ];
};

module.exports = {
    key: 'createActorRun',
    noun: 'Actor Run',
    display: {
        label: 'Run Actor',
        description: 'Run a specified actor.',
    },

    operation: {
        inputFields: [
            {
                label: 'Actor',
                helpText: 'Please select actor from the following list:',
                key: 'actorId',
                required: true,
                dynamic: 'actors.id.name',
                altersDynamicFields: true,
            },
            {
                label: 'Run synchronously',
                helpText: 'If it checks the Zap waits until task finises. The hard timeout for task run is 60s.',
                key: 'runSync',
                required: true,
                type: 'boolean',
                default: 'no',
            },
            getActorAdditionalFields,
        ],

        perform: runActor,

        sample: ACTOR_RUN_SAMPLE,
        outputFields: ACTOR_RUN_OUTPUT_FIELDS,
    },
};
