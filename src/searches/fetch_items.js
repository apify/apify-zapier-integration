const _ = require('underscore');
const { APIFY_API_ENDPOINTS, LEGACY_PHANTOM_JS_CRAWLER_ID, DATASET_PUBLISH_FIELDS } = require('../consts');
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

    const items = await getDatasetItems(z, dataset.id, { limit, offset }, dataset.actId);
    const cleanParamName = dataset.actId === LEGACY_PHANTOM_JS_CRAWLER_ID ? 'simplified' : 'clean';

    const createDatasetUrl = (format) => {
        return `${APIFY_API_ENDPOINTS.datasets}/${dataset.id}/items?${cleanParamName}=true&attachment=true&format=${format}`;
    };

    // Pick some fields to Zapier UI, other fields are useless for Zapier users.
    const cleanDataset = _.pick(dataset, DATASET_PUBLISH_FIELDS);

    return [{
        ...cleanDataset,
        items,
        itemsFileUrls: {
            XML: createDatasetUrl('xml'),
            CSV: createDatasetUrl('csv'),
            JSON: createDatasetUrl('json'),
            XLSX: createDatasetUrl('xlsx'),
        },
    }];
};

module.exports = {
    key: 'fetchDatasetItems',
    noun: 'Dataset Items',
    display: {
        label: 'Fetch Dataset Items',
        description: 'Download items from a dataset.',
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
    },
};
