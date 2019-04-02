const { APIFY_API_ENDPOINTS } = require('../consts');

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

    // You may return a promise or a normal data structure from any perform method.
    return response.json;
};

const unsubscribeWebhook = async (z, bundle) => {
    // bundle.subscribeData contains the parsed response JSON from the subscribe
    // request made initially.
    const webhookId = bundle.subscribeData.id;

    // You can build requests and our client will helpfully inject all the variables
    // you need to complete. You can also register middleware to control this.
    await z.request({
        url: `${APIFY_API_ENDPOINTS.webhooks}/${webhookId}`,
        method: 'DELETE',
    });

    // You may return a promise or a normal data structure from any perform method.
    return {};
};

const getTaskRun = async (z, bundle) => {
    // const task = await z.request({
    //     url: `${APIFY_API_ENDPOINTS.tasks}/${bundle.inputData.actorTaskId}`
    // });
    // TODO: Attach output and dataset items to task run
    return [bundle.cleanedRequest.resource];
};

const getFallbackTaskRun = async (z, bundle) => {
    // For the test poll, you should get some real data, to aid the setup process.
    const response = await z.request({ url: `${APIFY_API_ENDPOINTS.tasks}/${bundle.inputData.taskId}/runs` });
    return response.json.items;
};

// We recommend writing your triggers separate like this and rolling them
// into the App definition at the end.
module.exports = {
    key: 'taskRunFinished',

    noun: 'Task Run',
    display: {
        label: 'Task Finished',
        description: 'Trigger when a task is finished.',
    },

    // `operation` is where the business logic goes.
    operation: {

        // `inputFields` can define the fields a user could provide,
        // we'll pass them in as `bundle.inputData` later.
        inputFields: [
            {
                label: 'Task',
                helpText: 'Choose task which trigger action when finished.',
                key: 'taskId',
                required: true,
                dynamic: 'tasks.id.name',
            },
            // TODO: I can not get it work with multi choice
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
        ],

        type: 'hook',

        performSubscribe: subscribeWebkook,
        performUnsubscribe: unsubscribeWebhook,

        perform: getTaskRun,
        performList: getFallbackTaskRun,

        // In cases where Zapier needs to show an example record to the user, but we are unable to get a live example
        // from the API, Zapier will fallback to this hard-coded sample. It should reflect the data structure of
        // returned records, and have obviously dummy values that we can show to any user.
        sample: {
            id: 'HG7ML7M8z78YcAPEB',
            buildId: 'HG7ML7M8z78YcAPEB',
            startedAt: '2015-11-30T07:34:24.202Z',
            finishedAt: '2015-12-12T09:30:12.202Z',
            status: 'SUCCEEDED',
            defaultKeyValueStoreId: 'sfAjeR4QmeJCQzTfe',
            defaultDatasetId: '3ZojQDdFTsyE7Moy4',
            defaultRequestQueueId: 'so93g2shcDzK3pA85',
        },

        // If the resource can have fields that are custom on a per-user basis, define a function to fetch the custom
        // field definitions. The result will be used to augment the sample.
        // outputFields: () => { return []; }
        // Alternatively, a static field definition should be provided, to specify labels for the fields
        outputFields: [
            { key: 'id', label: 'ID' },
            { key: 'buildId', label: 'Build ID' },
            { key: 'startedAt', label: 'Created At' },
            { key: 'finishedAt', label: 'Created At' },
            { key: 'status', label: 'Status' },
            { key: 'defaultKeyValueStoreId', label: 'Default Key Value Store ID' },
            { key: 'defaultDatasetId', label: 'Default Dataset ID' },
            { key: 'defaultRequestQueueId', label: 'Default Request Queue ID' },
        ],
    },
};
