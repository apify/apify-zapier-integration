const { APIFY_API_ENDPOINTS } = require('../consts');

const subscribeWebkook = async (z, bundle) => {
    const { actorTaskId, eventTypes } = bundle.inputData;
    // `z.console.log()` is similar to `console.log()`.
    z.console.log('console says hello world!');

    const webhookOpts = {
        condition: {
            actorTaskId,
        },
        eventTypes,
        requestUrl: bundle.targetUrl,
    };
    const webhook = await z.request({
        url: `${APIFY_API_ENDPOINTS}`,
        method: 'POST',
        body: JSON.stringify(webhookOpts),
    });

    // You may return a promise or a normal data structure from any perform method.
    return webhook;
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
    return bundle.cleanedRequest;
};

// We recommend writing your triggers separate like this and rolling them
// into the App definition at the end.
module.exports = {
    key: 'task',

    noun: 'Task',
    display: {
        label: 'Task Finished',
        description: 'Trigger when a task is finished.',
    },

    // `operation` is where the business logic goes.
    operation: {

        // `inputFields` can define the fields a user could provide,
        // we'll pass them in as `bundle.inputData` later.
        inputFields: [
            { key: 'taskId', type: 'string', helpText: 'Choose task which trigger action when finished.' },
            { key: 'state', type: 'string', helpText: 'Choose state.' },
        ],

        type: 'hook',

        performSubscribe: subscribeWebkook,
        performUnsubscribe: unsubscribeWebhook,

        perform: getTaskRun,
        // performList: getFallbackRealRecipe,

        // In cases where Zapier needs to show an example record to the user, but we are unable to get a live example
        // from the API, Zapier will fallback to this hard-coded sample. It should reflect the data structure of
        // returned records, and have obviously dummy values that we can show to any user.
        sample: {
            id: 1,
            createdAt: 1472069465,
            name: 'Best Spagetti Ever',
            authorId: 1,
            directions: '1. Boil Noodles\n2.Serve with sauce',
            style: 'italian',
        },

        // If the resource can have fields that are custom on a per-user basis, define a function to fetch the custom
        // field definitions. The result will be used to augment the sample.
        // outputFields: () => { return []; }
        // Alternatively, a static field definition should be provided, to specify labels for the fields
        outputFields: [
            { key: 'id', label: 'ID' },
            { key: 'createdAt', label: 'Created At' },
            { key: 'name', label: 'Name' },
            { key: 'directions', label: 'Directions' },
            { key: 'authorId', label: 'Author ID' },
            { key: 'style', label: 'Style' },
        ],
    },
};
