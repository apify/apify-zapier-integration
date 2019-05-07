const { APIFY_API_ENDPOINTS, TASK_SAMPLE, TASK_OUTPUT_FIELDS } = require('../consts');
const { enrichTaskRun } = require('../apify_helpers');
const { wrapRequestWithRetries } = require('../request_helpers');

const runTask = async (z, bundle) => {
    const { taskId, runSync, keyValueStoreKeys } = bundle.inputData;

    const runResponse = await wrapRequestWithRetries(z.request, {
        url: `${APIFY_API_ENDPOINTS.tasks}/${taskId}/runs`,
        method: 'POST',
        params: runSync ? { waitForFinish: 120 } : {},
    });

    let run = runResponse.json;
    if (runSync) {
        run = await enrichTaskRun(z, run, keyValueStoreKeys);
    }

    return run;
};

module.exports = {
    key: 'createTaskRun',
    noun: 'Task Run',
    display: {
        label: 'Run Task',
        description: 'Run a selected actor task.',
    },

    operation: {
        inputFields: [
            {
                label: 'Task',
                helpText: 'Select the task from your list:',
                key: 'taskId',
                required: true,
                dynamic: 'tasks.id.name',
            },
            {
                label: 'Run synchronously',
                helpText: 'If checked, the Zap will wait until the task run is finished. Beware that a hard timeout for the run is 60 seconds.',
                key: 'runSync',
                required: true,
                type: 'boolean',
                default: 'no',
            },
        ],

        perform: runTask,

        sample: TASK_SAMPLE,
        outputFields: TASK_OUTPUT_FIELDS,
    },
};
