const { APIFY_API_ENDPOINTS, TASK_SAMPLE, TASK_OUTPUT_FIELDS } = require('../consts');
const { enrichTaskRun } = require('../apify_helpers');

const subscribeWebkook = async (z, bundle) => {
    const { taskId } = bundle.inputData;

    const webhookOpts = {
        eventTypes: [
            'ACTOR.RUN.SUCCEEDED',
            'ACTOR.RUN.FAILED',
            'ACTOR.RUN.TIMED_OUT',
            'ACTOR.RUN.ABORTED',
        ],
        condition: {
            actorTaskId: taskId,
        },
        requestUrl: bundle.targetUrl,
    };
    const response = await z.request({
        url: APIFY_API_ENDPOINTS.webhooks,
        method: 'POST',
        json: webhookOpts,
    });

    return response.json;
};

const unsubscribeWebhook = async (z, bundle) => {
    // bundle.subscribeData contains the parsed response JSON from the subscribe
    const webhookId = bundle.subscribeData.id;

    await z.request({
        url: `${APIFY_API_ENDPOINTS.webhooks}/${webhookId}`,
        method: 'DELETE',
    });

    return {};
};

const getTaskRun = async (z, bundle) => {
    const run = bundle.cleanedRequest.resource;
    const enrichRun = await enrichTaskRun(z, run, bundle.inputData.keyValueStoreKeys);
    return [enrichRun];
};

const getFallbackTaskRuns = async (z, bundle) => {
    const response = await z.request({ url: `${APIFY_API_ENDPOINTS.tasks}/${bundle.inputData.taskId}/runs` }, {
        params: {
            limit: 2,
            desc: true,
        },
    });

    const { items } = response.json;

    return Promise.map(items, (run) => enrichTaskRun(z, run, bundle.inputData.keyValueStoreKeys));
};

module.exports = {
    key: 'taskRunFinished',
    noun: 'Task Run',
    display: {
        label: 'Task Finished',
        description: 'Trigger when a task is finished.',
    },
    operation: {
        inputFields: [
            {
                label: 'Task',
                helpText: 'Choose task which trigger action when finished.',
                key: 'taskId',
                required: true,
                dynamic: 'tasks.id.name',
            },
            // TODO: I can not get it work with multiple choice
            // {
            //     label: 'State',
            //     helpText: 'Choose state.',
            //     key: 'state',
            //     choices: {
            //         'ACTOR.RUN.SUCCEEDED': 'Succeeded',
            //         'ACTOR.RUN.FAILED': 'Failed',
            //         'ACTOR.RUN.TIMED_OUT': 'Timed out',
            //         'ACTOR.RUN.ABORTED': 'Aborted',
            //     },
            // },
            {
                label: 'Key-value store keys to attach',
                helpText: 'Following keys from default key-value store will be attach to run detail. The OUTPUT and INPUT are attached by default.',
                key: 'keyValueStoreKeys',
                required: false,
                type: 'string',
                list: true,
            },
        ],
        type: 'hook',
        performSubscribe: subscribeWebkook,
        performUnsubscribe: unsubscribeWebhook,
        // Perform is called after each hit to the webhook API
        perform: getTaskRun,
        // PerformList is used to get testing data for users in Zapier app
        performList: getFallbackTaskRuns,
        sample: TASK_SAMPLE,
        outputFields: TASK_OUTPUT_FIELDS,
    },
};
