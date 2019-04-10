const { WEBHOOK_EVENT_TYPES } = require('apify-shared/consts');
const { APIFY_API_ENDPOINTS, TASK_SAMPLE, TASK_OUTPUT_FIELDS } = require('../consts');
const { enrichTaskRun } = require('../apify_helpers');
const { wrapRequestWithRetries } = require('../request_helpers');

const subscribeWebkook = async (z, bundle) => {
    const { taskId } = bundle.inputData;

    const webhookOpts = {
        eventTypes: Object.values(WEBHOOK_EVENT_TYPES),
        condition: {
            actorTaskId: taskId,
        },
        requestUrl: bundle.targetUrl,
    };
    const response = await z.request({
        url: APIFY_API_ENDPOINTS.webhooks,
        method: 'POST',
        json: webhookOpts,
    });

    return response.json;
};

const unsubscribeWebhook = async (z, bundle) => {
    // bundle.subscribeData contains the parsed response JSON from the subscribe
    const webhookId = bundle.subscribeData.id;

    await wrapRequestWithRetries(z.request, {
        url: `${APIFY_API_ENDPOINTS.webhooks}/${webhookId}`,
        method: 'DELETE',
    });

    return {};
};

const getTaskRun = async (z, bundle) => {
    const run = bundle.cleanedRequest.resource;
    const enrichRun = await enrichTaskRun(z, run);
    return [enrichRun];
};

const getFallbackTaskRuns = async (z, bundle) => {
    const response = await wrapRequestWithRetries(z.request, {
        url: `${APIFY_API_ENDPOINTS.tasks}/${bundle.inputData.taskId}/runs`,
        params: {
            limit: 2,
            desc: true,
        },
    });

    const { items } = response.json;

    return Promise.map(items, (run) => enrichTaskRun(z, run));
};

module.exports = {
    key: 'taskRunFinished',
    noun: 'Task run',
    display: {
        label: 'Task Finished',
        description: 'Trigger when a task run is finishes.',
    },
    operation: {
        inputFields: [
            {
                label: 'Task',
                helpText: 'Please select your task from the following list:',
                key: 'taskId',
                required: true,
                dynamic: 'tasks.id.name',
            },
        ],
        type: 'hook',
        performSubscribe: subscribeWebkook,
        performUnsubscribe: unsubscribeWebhook,
        // Perform is called after each hit to the webhook API
        perform: getTaskRun,
        // PerformList is used to get testing data for users in Zapier app
        performList: getFallbackTaskRuns,
        sample: TASK_SAMPLE,
        outputFields: TASK_OUTPUT_FIELDS,
    },
};
