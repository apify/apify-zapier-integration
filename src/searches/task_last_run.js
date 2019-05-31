const { ACT_JOB_STATUSES } = require('apify-shared/consts');
const { TASK_RUN_SAMPLE, TASK_RUN_OUTPUT_FIELDS, APIFY_API_ENDPOINTS } = require('../consts');
const { enrichActorRun } = require('../apify_helpers');
const { wrapRequestWithRetries } = require('../request_helpers');


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

    if (!lastTaskRunResponse.json) return [];

    const enrichRun = await enrichActorRun(z, lastTaskRunResponse.json);
    return [enrichRun];
};

module.exports = {
    key: 'searchTaskRun',
    noun: 'Last task run',
    display: {
        label: 'Find Last Task Run',
        description: 'Find the most recent task run with a specific status.',
        important: true,
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
                default: ACT_JOB_STATUSES.SUCCEEDED,
                choices: Object.values(ACT_JOB_STATUSES),
            },
        ],

        perform: getLastTaskRun,

        sample: TASK_RUN_SAMPLE,
        outputFields: TASK_RUN_OUTPUT_FIELDS,
    },
};
