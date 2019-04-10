const { ACT_JOB_STATUSES } = require('apify-shared/consts');
const { TASK_SAMPLE, TASK_OUTPUT_FIELDS, APIFY_API_ENDPOINTS } = require('../consts');
const { enrichTaskRun } = require('../apify_helpers');
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

    const enrichRun = await enrichTaskRun(z, lastTaskRunResponse.json);
    return [enrichRun];
};

module.exports = {
    key: 'searchTaskRun',
    noun: 'Last task run',
    display: {
        label: 'Find Last Task Run',
        description: 'Find the most recent task run based on the status.',
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
            {
                label: 'Status',
                key: 'status',
                required: false,
                choices: Object.values(ACT_JOB_STATUSES),
            },
        ],

        perform: getLastTaskRun,

        sample: TASK_SAMPLE,
        outputFields: TASK_OUTPUT_FIELDS,
    },
};
