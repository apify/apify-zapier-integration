const { APIFY_API_ENDPOINTS, TASK_RUN_SAMPLE, TASK_RUN_OUTPUT_FIELDS, DEFAULT_SYNC_RUN_TIMEOUT_SECS } = require('../consts');
const { enrichActorRun, buildRunCallbackWebhookParam, getActorRunOnResume } = require('../apify_helpers');
const { wrapRequestWithRetries } = require('../request_helpers');
const { getTaskDatasetOutputFields } = require('../output_fields');

const RAW_INPUT_LABEL = 'Input JSON overrides';

const getSyncTaskRunTimeoutSecs = async (z, taskId) => {
    const { data: task } = await wrapRequestWithRetries(z.request, {
        url: `${APIFY_API_ENDPOINTS.tasks}/${taskId}`,
    });

    let timeoutSecs = task.options?.timeoutSecs;
    if (!timeoutSecs) {
        const { data: actor } = await wrapRequestWithRetries(z.request, {
            url: `${APIFY_API_ENDPOINTS.actors}/${task.actId}`,
        });
        timeoutSecs = actor.defaultRunOptions?.timeoutSecs;
    }

    return Math.min(timeoutSecs || DEFAULT_SYNC_RUN_TIMEOUT_SECS, DEFAULT_SYNC_RUN_TIMEOUT_SECS);
};

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

    // Calling z.generateCallbackUrl() is what pauses the Zap step, so it must not be called when running async.
    if (runSync) {
        requestOpts.params = {
            ...requestOpts.params,
            timeout: await getSyncTaskRunTimeoutSecs(z, taskId),
            webhooks: buildRunCallbackWebhookParam(z.generateCallbackUrl()),
        };
    }

    const { data: run } = await wrapRequestWithRetries(z.request, requestOpts);

    // The step is paused here and finished by performResume once the run reaches a terminal status.
    if (runSync) return run;

    return enrichActorRun(z, bundle.authData.access_token, run);
};

const resumeTaskRun = async (z, bundle) => {
    const run = await getActorRunOnResume(z, bundle, true);
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
                helpText: 'If you choose `yes`, this step waits until the task run finishes and then returns its results. '
                    + 'The Zap shows the step as waiting in the meantime, and the run is limited by the timeout configured for the task '
                    + 'or its Actor, at most 1 hour, after which it is stopped. '
                    + 'If you choose `no`, the step returns as soon as the run starts, and you can fetch the results in a later step '
                    + 'with Find Last Task Run or Fetch Dataset Items, or in a second Zap that starts with the Finished Task Run trigger. '
                    + 'Note: testing this step on its own in the Zap editor may return as soon as the run starts, '
                    + 'without waiting for it to finish, even when you choose `yes`. Test the whole Zap to see the finished run and its results.',
                key: 'runSync',
                required: true,
                type: 'boolean',
                default: 'no',
            },
            getRawInputField,
        ],

        perform: runTask,
        performResume: resumeTaskRun,

        sample: TASK_RUN_SAMPLE,
        outputFields: [
            ...TASK_RUN_OUTPUT_FIELDS,
            getTaskDatasetOutputFields,
        ],
    },
};
