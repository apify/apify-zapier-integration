const { APIFY_API_ENDPOINTS, TASK_RUN_SAMPLE, TASK_RUN_OUTPUT_FIELDS } = require('../consts');
const { enrichActorRun } = require('../apify_helpers');
const { wrapRequestWithRetries } = require('../request_helpers');

const RAW_INPUT_LABEL = 'Raw input';

const runTask = async (z, bundle) => {
    const { taskId, runSync, rawInput } = bundle.inputData;

    const requestOpts = {
        url: `${APIFY_API_ENDPOINTS.tasks}/${taskId}/runs`,
        method: 'POST',
        params: runSync ? { waitForFinish: 120 } : {},
    };
    if (rawInput) {
        try {
            const parseInput = JSON.parse(rawInput);
            requestOpts.body = parseInput;
        } catch (err) {
            throw new Error(`Cannot parse JSON value from ${RAW_INPUT_LABEL} field: ${err.message}`);
        }
    }
    const runResponse = await wrapRequestWithRetries(z.request, requestOpts);

    let run = runResponse.json;
    if (runSync) {
        run = await enrichActorRun(z, run);
    }

    return run;
};

module.exports = {
    key: 'createTaskRun',
    noun: 'Task Run',
    display: {
        label: 'Run Task',
        description: 'Run a specified task.',
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
                label: 'Run synchronously',
                helpText: 'If you choose yes, the zap will wait until task finishes. The hard timeout for task run is 60s.',
                key: 'runSync',
                required: true,
                type: 'boolean',
                default: 'no',
            },
            {
                label: RAW_INPUT_LABEL,
                helpText: 'Advanced: If you want to alter the task input for the single run, '
                    + 'simply pass a JSON object defining overridden input below.',
                key: 'rawInput',
                required: false,
                type: 'text',
            },
        ],

        perform: runTask,

        sample: TASK_RUN_SAMPLE,
        outputFields: TASK_RUN_OUTPUT_FIELDS,
    },
};
