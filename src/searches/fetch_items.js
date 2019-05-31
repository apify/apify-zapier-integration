const _ = require('underscore');
const { APIFY_API_ENDPOINTS, DATASET_PUBLISH_FIELDS,
    DATASET_OUTPUT_FIELDS, DATASET_SAMPLE } = require('../consts');
const { wrapRequestWithRetries } = require('../request_helpers');
const { getDatasetItems } = require('../apify_helpers');

const getItems = async (z, bundle) => {
    const { datasetIdOrName, limit, offset } = bundle.inputData;
    let dataset;
    // The first try to get dataset by ID.
    try {
        const datasetResponse = await wrapRequestWithRetries(z.request, {
            url: `${APIFY_API_ENDPOINTS.datasets}/${datasetIdOrName}`,
            method: 'GET',
        });
        dataset = datasetResponse.json;
    } catch (err) {
        if (!err.message.includes('not found')) throw err;
    }

    // The second creates dataset with name, in case datasetId not found.
    if (!dataset) {
        const storeResponse = await wrapRequestWithRetries(z.request, {
            url: `${APIFY_API_ENDPOINTS.datasets}`,
            method: 'POST',
            params: {
                name: datasetIdOrName,
            },
        });
        dataset = storeResponse.json;
    }

    // NOTE: Because testing user had _id instead of id in data and we run integration tests under this user.
    dataset.id = dataset.id || dataset._id;

    const datasetItems = await getDatasetItems(z, dataset.id, { limit, offset }, dataset.actId);

    // Pick some fields to Zapier UI, other fields are useless for Zapier users.
    const cleanDataset = _.pick(dataset, DATASET_PUBLISH_FIELDS);

    return [{
        ...cleanDataset,
        ...datasetItems,
    }];
};

module.exports = {
    key: 'fetchDatasetItems',
    noun: 'Dataset Items',
    display: {
        label: 'Fetch Dataset Items',
        description: 'Downloads items from a dataset.',
    },

    operation: {
        inputFields: [
            {
                label: 'Dataset',
                helpText: 'Please enter the name or ID of the dataset.',
                key: 'datasetIdOrName',
                required: true,
            },
            {
                label: 'Limit',
                helpText: 'The maximum number of dataset items to fetch. If empty, the default limit will be used.',
                key: 'limit',
                required: false,
                type: 'integer',
            },
            {
                label: 'Offset',
                helpText: 'The offset in the dataset from where to start fetching the items. If empty, it will be from the beginning.',
                key: 'offset',
                required: false,
                type: 'integer',
            },
        ],

        perform: getItems,
        sample: DATASET_SAMPLE,
        outputFields: DATASET_OUTPUT_FIELDS,
    },
};
