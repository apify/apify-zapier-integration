const { APIFY_API_ENDPOINTS, TASK_RUN_SAMPLE, TASK_RUN_OUTPUT_FIELDS } = require('../consts');
const { enrichActorRun } = require('../apify_helpers');
const { wrapRequestWithRetries } = require('../request_helpers');

const RAW_INPUT_LABEL = 'Input JSON overrides';

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
        description: 'Run a selected actor task.',
    },

    operation: {
        inputFields: [
            {
                label: 'Task',
                helpText: 'Please select the task to run.',
                key: 'taskId',
                required: true,
                dynamic: 'tasks.id.name',
            },
            {
                label: 'Run synchronously',
                helpText: 'If you choose "yes", the Zap will wait until the task run is finished. '
                    + 'Beware that the hard timeout for the run is 60 seconds.',
                key: 'runSync',
                required: true,
                type: 'boolean',
                default: 'no',
            },
            {
                // TODO: Tasks can have non-JSON input, perhaps we should allow people to enter something non-JSON
                // here too, similarly as in actor run action
                label: RAW_INPUT_LABEL,
                helpText: 'Here you can enter a JSON object to override the task input configuration. '
                    + 'Only the provided fields will be overridden, the rest will be left unchanged.',
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
