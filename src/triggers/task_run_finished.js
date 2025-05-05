const { ACTOR_JOB_TERMINAL_STATUSES } = require('@apify/consts');
const { APIFY_API_ENDPOINTS, TASK_RUN_SAMPLE, TASK_RUN_OUTPUT_FIELDS, ACTOR_RUN_TERMINAL_STATUSES } = require('../consts');
const { enrichActorRun, subscribeWebhook, unsubscribeWebhook, getActorRun, getActorStatusesFromBundle } = require('../apify_helpers');
const { wrapRequestWithRetries } = require('../request_helpers');
const { getTaskDatasetOutputFields } = require('../output_fields');

const getFallbackTaskActorRuns = async (z, bundle) => {
    const response = await wrapRequestWithRetries(z.request, {
        url: `${APIFY_API_ENDPOINTS.tasks}/${bundle.inputData.taskId}/runs`,
        params: {
            limit: 100,
            desc: true,
        },
    });

    // NOTE: We need to get actId, because simple run object from list doesn't have it.
    const taskDetailResponse = await wrapRequestWithRetries(z.request, {
        url: `${APIFY_API_ENDPOINTS.tasks}/${bundle.inputData.taskId}`,
    });

    const statuses = getActorStatusesFromBundle(bundle) || ACTOR_JOB_TERMINAL_STATUSES;
    const { items } = response.data;
    const succeededRuns = items.filter((run) => (statuses.includes(run.status)));

    return Promise.map(succeededRuns.slice(0, 3), async ({ id }) => {
        const runResponse = await wrapRequestWithRetries(z.request, {
            url: `${APIFY_API_ENDPOINTS.actors}/${taskDetailResponse.data.actId}/runs/${id}`,
        });
        return enrichActorRun(z, runResponse.data);
    });
};

module.exports = {
    key: 'taskRunFinished',
    noun: 'Task run',
    display: {
        label: 'Finished Task Run',
        description: 'Triggers whenever a selected task is run and finished.',
    },
    operation: {
        inputFields: [
            {
                label: 'Task',
                helpText: 'Please select the task to keep an eye on.',
                key: 'taskId',
                required: true,
                dynamic: 'tasks.id.name',
            },
            {
                label: 'Statuses',
                helpText: 'Please select the terminal states of the task run. If no status is selected, all terminal statuses will be used.',
                key: 'statuses',
                required: false,
                list: true,
                choices: ACTOR_RUN_TERMINAL_STATUSES,
            },
        ],
        type: 'hook',
        performSubscribe: (z, bundle) => subscribeWebhook(z, bundle, { actorTaskId: bundle.inputData.taskId }),
        performUnsubscribe: unsubscribeWebhook,
        perform: getActorRun,
        performList: getFallbackTaskActorRuns,
        sample: TASK_RUN_SAMPLE,
        outputFields: [
            ...TASK_RUN_OUTPUT_FIELDS,
            getTaskDatasetOutputFields,
        ],
    },
};
