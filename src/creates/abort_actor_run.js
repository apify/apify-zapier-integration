const {
    APIFY_API_ENDPOINTS,
    ABORT_ACTOR_RUN_SAMPLE,
    ACTOR_RUN_OUTPUT_FIELDS,
} = require('../consts');
const { enrichActorRun } = require('../apify_helpers');
const { wrapRequestWithRetries } = require('../request_helpers');
const { getRunDatasetOutputFields } = require('../output_fields');

// Aborting a run that already reached a terminal status is a no-op, the API returns it unchanged,
// so a repeated abort is safe and needs no guard here.
const abortActorRun = async (z, bundle) => {
    const { runId, gracefully } = bundle.inputData;

    // Only send `gracefully` when it is set, the API default is an immediate abort.
    const { data: run } = await wrapRequestWithRetries(z.request, {
        url: `${APIFY_API_ENDPOINTS.actorRuns}/${runId}/abort`,
        method: 'POST',
        params: gracefully ? { gracefully: true } : {},
    });

    return enrichActorRun(z, bundle.authData.access_token, run);
};

module.exports = {
    key: 'abortActorRun',
    noun: 'Actor Run',
    display: {
        label: 'Abort Actor Run',
        description: 'Aborts a running or ready Actor run by its ID. '
            + 'Use this to stop a run that is no longer needed or that has exceeded an expected duration.',
    },

    operation: {
        inputFields: [
            {
                label: 'Run ID',
                key: 'runId',
                required: true,
                type: 'string',
                helpText: 'The ID of the Actor run to abort, e.g. `HG7ML7M8z78YcAPEB`. '
                    + 'You typically get this from a previous **Run Actor** or **Run Task** step.',
            },
            {
                label: 'Abort gracefully',
                key: 'gracefully',
                required: false,
                type: 'boolean',
                default: 'no',
                helpText: 'If `yes`, the run first moves to the `ABORTING` status and is given time to save its state '
                    + 'before it ends as `ABORTED`. If `no`, the run is aborted immediately.',
            },
        ],

        perform: abortActorRun,

        sample: ABORT_ACTOR_RUN_SAMPLE,
        outputFields: [
            ...ACTOR_RUN_OUTPUT_FIELDS,
            getRunDatasetOutputFields,
        ],
    },
};
