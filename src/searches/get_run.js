const {
    ACTOR_RUN_SAMPLE,
    ACTOR_RUN_OUTPUT_FIELDS,
    APIFY_API_ENDPOINTS,
} = require('../consts');
const { enrichActorRun } = require('../apify_helpers');
const { wrapRequestWithRetries, isNotFoundError } = require('../request_helpers');
const { getRunDatasetOutputFields } = require('../output_fields');

const getActorRunById = async (z, bundle) => {
    const { runId } = bundle.inputData;
    let runResponse;

    try {
        runResponse = await wrapRequestWithRetries(z.request, {
            url: `${APIFY_API_ENDPOINTS.actorRuns}/${runId}`,
        });
    } catch (err) {
        if (isNotFoundError(err)) return [];

        throw err;
    }

    const enrichRun = await enrichActorRun(z, bundle.authData.access_token, runResponse.data);
    return [enrichRun];
};

module.exports = {
    key: 'getActorRunById',
    noun: 'Actor Run',
    display: {
        label: 'Get Actor Run by ID',
        description: 'Retrieves details and results of a specific Actor run by its ID. '
            + 'Use this to check the status or fetch the output of a run started in a previous step. '
            + 'The run can be triggered by Run Actor or Run Task.',
    },

    operation: {
        inputFields: [
            {
                label: 'Run ID',
                key: 'runId',
                required: true,
                type: 'string',
                helpText: 'The ID of the Actor run to retrieve, e.g. `HG7ML7M8z78YcAPEB`. '
                    + 'You typically get this from a previous **Run Actor** or **Run Task** step.',
            },
        ],

        perform: getActorRunById,

        sample: ACTOR_RUN_SAMPLE,
        outputFields: [
            ...ACTOR_RUN_OUTPUT_FIELDS,
            getRunDatasetOutputFields,
        ],
    },
};
