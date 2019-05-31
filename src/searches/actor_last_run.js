const { ACT_JOB_STATUSES } = require('apify-shared/consts');
const { ACTOR_RUN_SAMPLE, ACTOR_RUN_OUTPUT_FIELDS, APIFY_API_ENDPOINTS } = require('../consts');
const { enrichActorRun } = require('../apify_helpers');
const { wrapRequestWithRetries } = require('../request_helpers');


const getLastActorRun = async (z, bundle) => {
    const { actorId, status } = bundle.inputData;
    let lastActorRunResponse;

    try {
        lastActorRunResponse = await wrapRequestWithRetries(z.request, {
            url: `${APIFY_API_ENDPOINTS.actors}/${actorId}/runs/last`,
            params: status ? { status } : {},
        });
    } catch (err) {
        if (err.message.includes('not found')) return [];

        throw err;
    }

    const enrichRun = await enrichActorRun(z, lastActorRunResponse.json);
    return [enrichRun];
};

module.exports = {
    key: 'searchActorRun',
    noun: 'Last actor run',
    display: {
        label: 'Find Last Actor Run',
        description: 'Find the most recent actor run with a specific status.',
    },
    important: true,

    operation: {
        inputFields: [
            {
                label: 'Actor',
                helpText: 'Please select the actor, whose last run you want to get.',
                key: 'actorId',
                required: true,
                dynamic: 'actors.id.name',
            },
            {
                label: 'Run status',
                key: 'status',
                required: false,
                default: ACT_JOB_STATUSES.SUCCEEDED,
                choices: Object.values(ACT_JOB_STATUSES),
            },
        ],

        perform: getLastActorRun,

        sample: ACTOR_RUN_SAMPLE,
        outputFields: ACTOR_RUN_OUTPUT_FIELDS,
    },
};
