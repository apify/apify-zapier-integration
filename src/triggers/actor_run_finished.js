const { ACTOR_JOB_STATUSES } = require('@apify/consts');
const { APIFY_API_ENDPOINTS, ACTOR_RUN_SAMPLE, ACTOR_RUN_OUTPUT_FIELDS } = require('../consts');
const { enrichActorRun, subscribeWebhook, unsubscribeWebhook, getActorRun } = require('../apify_helpers');
const { wrapRequestWithRetries } = require('../request_helpers');
const { getActorDatasetOutputFields } = require('../output_fields');

const getFallbackActorRuns = async (z, bundle) => {
    const response = await wrapRequestWithRetries(z.request, {
        url: `${APIFY_API_ENDPOINTS.actors}/${bundle.inputData.actorId}/runs`,
        params: {
            limit: 100,
            desc: true,
        },
    });

    const { items } = response.data;
    const succeededRuns = items.filter((run) => (run.status === ACTOR_JOB_STATUSES.SUCCEEDED));

    return Promise.map(succeededRuns.slice(0, 3), async ({ id }) => {
        const runResponse = await wrapRequestWithRetries(z.request, {
            url: `${APIFY_API_ENDPOINTS.actors}/${bundle.inputData.actorId}/runs/${id}`,
        });
        return enrichActorRun(z, runResponse.data);
    });
};

module.exports = {
    key: 'actorRunFinished',
    noun: 'Actor run',
    display: {
        label: 'Finished Actor Run',
        description: 'Triggers whenever a selected actor is run and finished.',
    },
    operation: {
        inputFields: [
            {
                label: 'Actor',
                helpText: 'Please select the actor to keep an eye on.',
                key: 'actorId',
                required: true,
                dynamic: 'actors.id.name',
            },
        ],
        type: 'hook',
        performSubscribe: (z, bundle) => subscribeWebhook(z, bundle, { actorId: bundle.inputData.actorId }),
        performUnsubscribe: unsubscribeWebhook,
        // Perform is called after each hit to the webhook API
        perform: getActorRun,
        // PerformList is used to get testing data for users in Zapier app
        performList: getFallbackActorRuns,
        // In cases where Zapier needs to show an example record to the user, but we are unable to get a live example
        sample: ACTOR_RUN_SAMPLE,
        outputFields: [
            ...ACTOR_RUN_OUTPUT_FIELDS,
            getActorDatasetOutputFields,
        ],
    },
};
