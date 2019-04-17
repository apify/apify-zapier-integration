const { APIFY_API_ENDPOINTS, TASK_SAMPLE, TASK_OUTPUT_FIELDS } = require('../consts');
const { enrichTaskRun, subscribeWebkook, unsubscribeWebhook, getActorkRun } = require('../apify_helpers');
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

    return Promise.map(items, (run) => enrichTaskRun(z, run));
};

module.exports = {
    key: 'actorRunFinished',
    noun: 'Actor run',
    display: {
        label: 'Actor Finished',
        description: 'Trigger when an actor run is finishes.',
    },
    operation: {
        inputFields: [
            {
                label: 'Actor',
                helpText: 'Please select your actor from the following list:',
                key: 'actorId',
                required: true,
                dynamic: 'actors.id.name',
            },
        ],
        type: 'hook',
        performSubscribe: (z, bundle) => subscribeWebkook(z, bundle, { actorId: bundle.inputData.actorId }),
        performUnsubscribe: unsubscribeWebhook,
        // Perform is called after each hit to the webhook API
        perform: getActorkRun,
        // PerformList is used to get testing data for users in Zapier app
        performList: getFallbackActorRuns,
        // In cases where Zapier needs to show an example record to the user, but we are unable to get a live example
        sample: TASK_SAMPLE,
        outputFields: TASK_OUTPUT_FIELDS,
    },
};
