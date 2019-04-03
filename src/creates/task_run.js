const Promise = require('bluebird');
const { APIFY_API_ENDPOINTS, TASK_SAMPLE, TASK_OUTPUT_FIELDS } = require('../consts');
const { enrichTaskRun } = require('../apify_helpers');

const runTask = async (z, bundle) => {
    const { taskId, runSync, keyValueStoreKeys } = bundle.inputData;

    const runResponse = await z.request(`${APIFY_API_ENDPOINTS.tasks}/${taskId}/runs`, {
        method: 'POST',
        params: runSync ? { waitForFinish: 120 } : {},
    });

    let run = runResponse.json;
    if (runSync) {
        run = await enrichTaskRun(z, run, keyValueStoreKeys);
    }

    return run;
};

module.exports = {
    key: 'taskRun',
    noun: 'Task',
    display: {
        label: 'Run Task',
        description: 'Run a specified task.',
    },

    // `operation` is where the business logic goes.
    operation: {
        inputFields: [
            {
                label: 'Task',
                helpText: 'Choose task to run.',
                key: 'taskId',
                required: true,
                dynamic: 'tasks.id.name',
            },
            {
                label: 'Run Synchronously',
                helpText: 'If it checks the Zap waits until task finises. The hard timeout for actor is 60s.',
                key: 'runSync',
                required: true,
                type: 'boolean',
            },
            {
                label: 'Key-value store keys to attach',
                helpText: 'Following keys from default key-value store will be attach to run detail. The OUTPUT and INPUT are attached by default.',
                key: 'keyValueStoreKeys',
                required: false,
                type: 'string',
                list: true,
            },
        ],
        perform: runTask,

        sample: TASK_SAMPLE,
        outputFields: TASK_OUTPUT_FIELDS,
    },
};
