const { APIFY_API_ENDPOINTS, TASK_RUN_SAMPLE, TASK_RUN_OUTPUT_FIELDS } = require('../consts');
const { enrichActorRun, subscribeWebkook, unsubscribeWebhook, getActorRun } = require('../apify_helpers');
const { wrapRequestWithRetries } = require('../request_helpers');

const getFallbackActorRuns = async (z, bundle) => {
    const response = await wrapRequestWithRetries(z.request, {
        url: `${APIFY_API_ENDPOINTS.actors}/${bundle.inputData.actorId}/runs`,
        params: {
            limit: 2,
            desc: true,
        },
    });

    const { items } = response.json;

    return Promise.map(items, async ({ id }) => {
        const runResponse = await wrapRequestWithRetries(z.request, {
            url: `${APIFY_API_ENDPOINTS.actors}/${bundle.inputData.actorId}/runs/${id}`,
        });
        return enrichActorRun(z, runResponse.json);
    });
};

module.exports = {
    key: 'actorRunFinished',
    noun: 'Actor run',
    display: {
        label: 'Finished Actor Run',
        description: 'Triggers whenever a selected actor is run and finished.',
        important: true,
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
        performSubscribe: (z, bundle) => subscribeWebkook(z, bundle, { actorId: bundle.inputData.actorId }),
        performUnsubscribe: unsubscribeWebhook,
        // Perform is called after each hit to the webhook API
        perform: getActorRun,
        // PerformList is used to get testing data for users in Zapier app
        performList: getFallbackActorRuns,
        // In cases where Zapier needs to show an example record to the user, but we are unable to get a live example
        sample: TASK_RUN_SAMPLE,
        outputFields: TASK_RUN_OUTPUT_FIELDS,
    },
};
