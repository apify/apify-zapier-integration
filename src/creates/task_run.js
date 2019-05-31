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
            throw new Error(`Please check that your ${RAW_INPUT_LABEL} is valid JSON.`);
        }
    }
    const runResponse = await wrapRequestWithRetries(z.request, requestOpts);

    let run = runResponse.json;
    if (runSync) {
        run = await enrichActorRun(z, run);
    }

    return run;
};

const getRawInputField = async (z, bundle) => {
    const { taskId } = bundle.inputData;
    let helpText = 'Here you can enter a JSON object to override the task input configuration. '
    + 'Only the provided fields will be overridden, the rest will be left unchanged.';

    const { json: task } = await wrapRequestWithRetries(z.request, {
        url: `${APIFY_API_ENDPOINTS.tasks}/${taskId}`,
    });
    const { json: actor } = await wrapRequestWithRetries(z.request, {
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
        description: 'Run a selected actor task.',
        important: true,
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
                    + 'Beware that the hard timeout for the run is 60 seconds.',
                key: 'runSync',
                required: true,
                type: 'boolean',
                default: 'no',
            },
            getRawInputField,
        ],

        perform: runTask,

        sample: TASK_RUN_SAMPLE,
        outputFields: TASK_RUN_OUTPUT_FIELDS,
    },
};
