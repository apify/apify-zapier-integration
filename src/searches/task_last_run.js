const {
    TASK_RUN_SAMPLE,
    TASK_RUN_OUTPUT_FIELDS,
    APIFY_API_ENDPOINTS,
    ACTOR_RUN_STATUSES,
} = require('../consts');
const { enrichActorRun } = require('../apify_helpers');
const { wrapRequestWithRetries } = require('../request_helpers');
const { getTaskDatasetOutputFields } = require('../output_fields');

const getLastTaskRun = async (z, bundle) => {
    const { taskId, status } = bundle.inputData;
    let lastTaskRunResponse;

    try {
        lastTaskRunResponse = await wrapRequestWithRetries(z.request, {
            url: `${APIFY_API_ENDPOINTS.tasks}/${taskId}/runs/last`,
            params: status ? { status } : {},
        });
    } catch (err) {
        if (err.message.includes('not found')) return [];

        throw err;
    }

    if (!lastTaskRunResponse.data) return [];

    const enrichRun = await enrichActorRun(z, bundle.authData.access_token, lastTaskRunResponse.data);
    return [enrichRun];
};

module.exports = {
    key: 'searchTaskRun',
    noun: 'Last task run',
    display: {
        label: 'Find Last Task Run',
        description: 'Finds the most recent task run with a specific status.',
    },

    operation: {
        inputFields: [
            {
                label: 'Task',
                helpText: 'Please select the task, whose last run you want to get.',
                key: 'taskId',
                required: true,
                dynamic: 'tasks.id.name',
            },
            {
                label: 'Run status',
                key: 'status',
                required: false,
                // Zapier selection dropdown expects individual options to be passed in { value: label } form
                default: ACTOR_RUN_STATUSES.SUCCEEDED,
                choices: ACTOR_RUN_STATUSES,
            },
        ],

        perform: getLastTaskRun,

        sample: TASK_RUN_SAMPLE,
        outputFields: [
            ...TASK_RUN_OUTPUT_FIELDS,
            getTaskDatasetOutputFields,
        ],
    },
};
