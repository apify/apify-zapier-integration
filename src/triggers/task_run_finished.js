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

    // NOTE: We need to get actId, because simple run object from list doesn't have it.
    const taskDetailResponse = await wrapRequestWithRetries(z.request, {
        url: `${APIFY_API_ENDPOINTS.tasks}/${bundle.inputData.taskId}`,
    });

    const { items } = response.json;

    return Promise.map(items, async ({ id }) => {
        const runResponse = await wrapRequestWithRetries(z.request, {
            url: `${APIFY_API_ENDPOINTS.actors}/${taskDetailResponse.json.actId}/runs/${id}`,
        });
        return enrichActorRun(z, runResponse.json);
    });
};

module.exports = {
    key: 'taskRunFinished',
    noun: 'Task run',
    display: {
        label: 'Task Run',
        description: 'Triggers whenever a selected task is run and finished.',
    },
    important: true,
    operation: {
        inputFields: [
            {
                label: 'Task',
                helpText: 'Please select the task to keep an eye on.',
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
