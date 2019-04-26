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
