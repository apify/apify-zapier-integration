const { APIFY_API_ENDPOINTS, TASK_RUN_SAMPLE, TASK_RUN_OUTPUT_FIELDS } = require('../consts');
const { enrichActorRun, subscribeWebkook, unsubscribeWebhook, getActorRun } = require('../apify_helpers');
const { wrapRequestWithRetries } = require('../request_helpers');

const getFallbackTaskActorRuns = async (z, bundle) => {
    const response = await wrapRequestWithRetries(z.request, {
        url: `${APIFY_API_ENDPOINTS.tasks}/${bundle.inputData.taskId}/runs`,
        params: {
            limit: 2,
            desc: true,
        },
    });

    const { items } = response.json;

    return Promise.map(items, (run) => enrichActorRun(z, run));
};

module.exports = {
    key: 'taskRunFinished',
    noun: 'Task run',
    display: {
        label: 'Task Finished',
        description: 'Trigger when a task run is finished.',
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
        performSubscribe: (z, bundle) => subscribeWebkook(z, bundle, { actorTaskId: bundle.inputData.taskId }),
        performUnsubscribe: unsubscribeWebhook,
        perform: getActorRun,
        performList: getFallbackTaskActorRuns,
        sample: TASK_RUN_SAMPLE,
        outputFields: TASK_RUN_OUTPUT_FIELDS,
    },
};
