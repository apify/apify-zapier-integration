const _ = require('lodash');
const { APIFY_API_ENDPOINTS, TASK_RUN_SAMPLE, TASK_RUN_OUTPUT_FIELDS, DEFAULT_SYNC_RUN_TIMEOUT_SECS,
    OMIT_ACTOR_RUN_FIELDS } = require('../consts');
const { enrichActorRun, buildRunCallbackWebhookParam, getActorRunOnResume } = require('../apify_helpers');
const { wrapRequestWithRetries, waitForRunToFinish, getRemainingTestStepWaitSecs } = require('../request_helpers');
const { getTaskDatasetOutputFields } = require('../output_fields');

const RAW_INPUT_LABEL = 'Input JSON overrides';

const getSyncTaskRunTimeoutSecs = async (z, taskId) => {
    try {
        const { data: task } = await wrapRequestWithRetries(z.request, {
            url: `${APIFY_API_ENDPOINTS.tasks}/${taskId}`,
        });

        let timeoutSecs = task.options?.timeoutSecs;
        // A `0` means "no timeout", not "not configured", so only an absent value inherits the Actor default.
        if (timeoutSecs === undefined || timeoutSecs === null) {
            const { data: actor } = await wrapRequestWithRetries(z.request, {
                url: `${APIFY_API_ENDPOINTS.actors}/${task.actId}`,
            });
            timeoutSecs = actor.defaultRunOptions?.timeoutSecs;
        }

        return Math.min(timeoutSecs || DEFAULT_SYNC_RUN_TIMEOUT_SECS, DEFAULT_SYNC_RUN_TIMEOUT_SECS);
    } catch (err) {
        return DEFAULT_SYNC_RUN_TIMEOUT_SECS;
    }
};

const runTask = async (z, bundle) => {
    const stepStartedAt = Date.now();
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

    // The Zap editor cannot wait for the callback, so a test step waits for the results inline.
    const isTestStep = !!bundle.meta?.isLoadingSample;

    // Calling z.generateCallbackUrl() is what pauses the Zap step, so it must not be called when running async.
    if (runSync) {
        requestOpts.params = {
            ...requestOpts.params,
            timeout: await getSyncTaskRunTimeoutSecs(z, taskId),
        };
        if (!isTestStep) requestOpts.params.webhooks = buildRunCallbackWebhookParam(z.generateCallbackUrl());
    }

    const { data: run } = await wrapRequestWithRetries(z.request, requestOpts);

    if (runSync) {
        // The step is paused here and finished by performResume once the run reaches a terminal status.
        if (!isTestStep) return _.omit(run, OMIT_ACTOR_RUN_FIELDS);

        const waitedRun = await waitForRunToFinish(z.request, run.id, getRemainingTestStepWaitSecs(stepStartedAt));
        return enrichActorRun(z, bundle.authData.access_token, waitedRun || run);
    }

    return enrichActorRun(z, bundle.authData.access_token, run);
};

const resumeTaskRun = async (z, bundle) => {
    const run = await getActorRunOnResume(z, bundle, true);
    return enrichActorRun(z, bundle.authData.access_token, run);
};

const getRawInputField = async (z, bundle) => {
    const { taskId } = bundle.inputData;
    let helpText = 'JSON object that overrides the task input. Fields you leave out keep their saved values.';

    const { data: task } = await wrapRequestWithRetries(z.request, {
        url: `${APIFY_API_ENDPOINTS.tasks}/${taskId}`,
    });
    const { data: actor } = await wrapRequestWithRetries(z.request, {
        url: `${APIFY_API_ENDPOINTS.actors}/${task.actId}`,
    });

    if (actor && actor.isPublic) {
        helpText += ` See the [input schema](https://apify.com/${actor.username}/${actor.name}?section=input-schema) `
            + 'for field details.';
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
        description: 'Runs a saved Actor task. To run an Actor with custom input, use Run Actor instead.',
    },

    operation: {
        inputFields: [
            {
                label: 'Task',
                helpText: 'Select the task to run.',
                key: 'taskId',
                required: true,
                dynamic: 'tasks.id.name',
                altersDynamicFields: true,
            },
            {
                label: 'Run synchronously',
                helpText: 'If `yes` (default), the step waits for the run to finish and returns its results. '
                    + 'The run stops when it reaches the timeout set for the task or its Actor, at most 1 hour. '
                    + 'If `no`, the step returns as soon as the run starts. Get the results later with **Fetch Dataset Items**, '
                    + 'or in a second Zap that starts with the **Finished Task Run** trigger. '
                    + 'When you test this step alone in the Zap editor, it waits about 25 seconds and returns the results so far. '
                    + 'Test the whole Zap to see all results.',
                key: 'runSync',
                required: true,
                type: 'boolean',
                default: 'yes',
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
