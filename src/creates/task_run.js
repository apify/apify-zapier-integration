const { APIFY_API_ENDPOINTS, TASK_RUN_SAMPLE, TASK_RUN_OUTPUT_FIELDS } = require('../consts');
const { enrichActorRun } = require('../apify_helpers');
const { wrapRequestWithRetries } = require('../request_helpers');
const { getTaskDatasetOutputFields } = require('../output_fields');

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
            throw new Error(`Please check that your ${RAW_INPUT_LABEL} is a valid JSON.`);
        }
    }
    const { data: run } = await wrapRequestWithRetries(z.request, requestOpts);

    return enrichActorRun(z, run);
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
        description: 'Runs a selected actor task.',
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
