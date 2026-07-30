const { APIFY_API_ENDPOINTS, TASK_RUN_SAMPLE, TASK_RUN_OUTPUT_FIELDS, DEFAULT_RUN_WAIT_TIME_OUT_SECONDS } = require('../consts');
const { enrichActorRun } = require('../apify_helpers');
const { wrapRequestWithRetries, waitForRunToFinish } = require('../request_helpers');
const { getTaskDatasetOutputFields } = require('../output_fields');

const RAW_INPUT_LABEL = 'Input JSON overrides';
const runTask = async (z, bundle) => {
    const { taskId, runSync, rawInput } = bundle.inputData;

    const requestOpts = {
        url: `${APIFY_API_ENDPOINTS.tasks}/${taskId}/runs`,
        method: 'POST',
    };

    let parsedInput;
    if (rawInput) {
        try {
            parsedInput = JSON.parse(rawInput);
            requestOpts.body = parsedInput;
        } catch (err) {
            throw new Error(`The "${RAW_INPUT_LABEL}" field is not valid JSON: ${err.message}. Please provide a valid JSON object.`);
        }
    }

    let { data: run } = await wrapRequestWithRetries(z.request, requestOpts);
    if (runSync) {
        run = await waitForRunToFinish(z.request, run.id, DEFAULT_RUN_WAIT_TIME_OUT_SECONDS, true);
    }

    return enrichActorRun(z, bundle.authData.access_token, run);
};

const getRawInputField = async (z, bundle) => {
    const { taskId } = bundle.inputData;
    let helpText = 'Here you can enter a JSON object to override the task input configuration. '
        + 'Only the provided fields will be overridden, the rest will be left unchanged.';

    const { data: task } = await wrapRequestWithRetries(z.request, {
        url: `${APIFY_API_ENDPOINTS.tasks}/${taskId}`,
    });
    const { data: actor } = await wrapRequestWithRetries(z.request, {
        url: `${APIFY_API_ENDPOINTS.actors}/${task.actId}`,
    });

    if (actor && actor.isPublic) {
        helpText += ` See [documentation](https://apify.com/${actor.username}/${actor.name}?section=input-schema) `
            + 'for detailed fields description.';
    }

    return {
        // TODO: Tasks can have non-JSON input, perhaps we should allow people to enter something non-JSON
        label: RAW_INPUT_LABEL,
        helpText,
        key: 'rawInput',
        required: false,
        type: 'text',
    };
};

module.exports = {
    key: 'createTaskRun',
    noun: 'Task Run',
    display: {
        label: 'Run Task',
        description: 'Runs a saved Actor task (an Actor pre-configured with fixed input and settings in Apify Console). '
            + 'Use this when the configuration already exists; for ad-hoc runs with custom input, use Run Actor instead. '
            + 'Returns the run ID, status, and default dataset ID; retrieve the results with Fetch Dataset Items.',
    },

    operation: {
        inputFields: [
            {
                label: 'Task',
                helpText: 'Please select the task to run.',
                key: 'taskId',
                required: true,
                dynamic: 'tasks.id.name',
                altersDynamicFields: true,
            },
            {
                label: 'Run synchronously',
                helpText: 'If you choose "yes", the Zap will wait until the task run is finished. '
                    + 'Beware that the hard timeout for the run is 30 seconds.',
                key: 'runSync',
                required: true,
                type: 'boolean',
                default: 'no',
            },
            getRawInputField,
        ],

        perform: runTask,

        sample: TASK_RUN_SAMPLE,
        outputFields: [
            ...TASK_RUN_OUTPUT_FIELDS,
            getTaskDatasetOutputFields,
        ],
    },
};
