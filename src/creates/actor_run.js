const { APIFY_API_ENDPOINTS, ACTOR_RUN_SAMPLE, ACTOR_RUN_OUTPUT_FIELDS } = require('../consts');
const { enrichActorRun, getActorAdditionalFields } = require('../apify_helpers');
const { wrapRequestWithRetries } = require('../request_helpers');

const runActor = async (z, bundle) => {
    const { actorId, runSync, inputBody, inputContentType, build, timeoutSecs, memoryMbytes } = bundle.inputData;

    const requestOpts = {
        url: `${APIFY_API_ENDPOINTS.actors}/${actorId}/runs`,
        method: 'POST',
        params: {
            build,
            timeout: timeoutSecs,
            memory: parseInt(memoryMbytes, 10),
        },
    };

    if (runSync) requestOpts.params.waitForFinish = 120;
    if (inputContentType) {
        requestOpts.headers = {
            'Content-Type': inputContentType,
        };
    }
    if (inputBody) {
        if (inputContentType.includes('application/json')) {
            try {
                JSON.parse(inputBody);
            } catch (err) {
                throw new Error('Please check that your input body is valid JSON.');
            }
        }
        requestOpts.body = inputBody;
    }

    const { json: run } = await wrapRequestWithRetries(z.request, requestOpts);

    return enrichActorRun(z, run);
};

module.exports = {
    key: 'createActorRun',
    noun: 'Actor Run',
    display: {
        label: 'Run Actor',
        description: 'Runs a selected actor.',
        important: true,
    },

    operation: {
        inputFields: [
            {
                label: 'Actor',
                helpText: 'Please select the actor to run.',
                key: 'actorId',
                required: true,
                dynamic: 'actors.id.name',
                altersDynamicFields: true,
            },
            {
                label: 'Run synchronously',
                helpText: 'If you choose `yes`, the Zap will wait until the actor run is finished. '
                    + 'Beware that the hard timeout for the run is 60 seconds.',
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
