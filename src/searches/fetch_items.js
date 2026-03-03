const _ = require('lodash');
const { APIFY_API_ENDPOINTS, DATASET_PUBLISH_FIELDS,
    DATASET_OUTPUT_FIELDS, DATASET_SAMPLE } = require('../consts');
const { wrapRequestWithRetries } = require('../request_helpers');
const { getDatasetItems } = require('../apify_helpers');
const { getDatasetItemsOutputFields } = require('../output_fields');

const findDatasetByNameOrId = async (z, datasetIdOrName) => {
    // The first try to get dataset by ID.
    try {
        const datasetResponse = await wrapRequestWithRetries(z.request, {
            url: `${APIFY_API_ENDPOINTS.datasets}/${datasetIdOrName}`,
            method: 'GET',
        });
        return datasetResponse.data;
    } catch (err) {
        if (!err.message.includes('not found')) throw err;
    }
    // The second creates dataset with name, in case datasetId not found.
    const storeResponse = await wrapRequestWithRetries(z.request, {
        url: `${APIFY_API_ENDPOINTS.datasets}`,
        method: 'POST',
        params: {
            name: datasetIdOrName,
        },
    });
    return storeResponse.data;
};

const getItems = async (z, bundle) => {
    const { datasetIdOrName, limit, offset, fields, omit } = bundle.inputData;
    const dataset = await findDatasetByNameOrId(z, datasetIdOrName);

    // NOTE: Because testing user had _id instead of id in data and we run integration tests under this user.
    dataset.id = dataset.id || dataset._id;

    const trimFields = (value) => value.split(',').map((f) => f.trim()).join(',');

    const params = { limit, offset };
    if (fields && fields.length) params.fields = trimFields(fields);
    if (omit && omit.length) params.omit = trimFields(omit);

    const datasetItems = await getDatasetItems(z, dataset.id, bundle.authData.access_token, params, dataset.actId);

    // Pick some fields to Zapier UI, other fields are useless for Zapier users.
    const cleanDataset = _.pick(dataset, DATASET_PUBLISH_FIELDS);

    return [{
        ...cleanDataset,
        ...datasetItems,
    }];
};

const getAdditionalDatasetItemsOutputFields = async (z, bundle) => {
    const { datasetIdOrName } = bundle.inputData;
    const dataset = await findDatasetByNameOrId(z, datasetIdOrName);

    return getDatasetItemsOutputFields(z, dataset.id, dataset.actId, bundle.authData.access_token, 'items[]');
};

module.exports = {
    key: 'fetchDatasetItems',
    noun: 'Dataset Items',
    display: {
        label: 'Fetch Dataset Items',
        description: 'Fetches items from a dataset.',
    },

    operation: {
        inputFieldGroups: [
            { key: 'basic', label: 'Basic Options', emphasize: true },
            { key: 'advanced', label: 'Advanced Options', emphasize: false },
        ],
        inputFields: [
            {
                label: 'Dataset',
                helpText: 'Please enter the name or ID of the dataset. '
                    + 'You can find dataset ID under each a task or an Actor run detail. '
                    + 'The usual way is to use default dataset ID from the task or the Actor run trigger.',
                key: 'datasetIdOrName',
                required: true,
                group: 'basic',
            },
            {
                label: 'Limit',
                helpText: 'The maximum number of dataset items to fetch. If empty, the default limit will be used.',
                key: 'limit',
                required: false,
                type: 'integer',
                group: 'basic',
            },
            {
                label: 'Offset',
                helpText: 'The offset in the dataset from where to start fetching the items. If empty, it will be from the beginning.',
                key: 'offset',
                required: false,
                type: 'integer',
                group: 'basic',
            },
            {
                label: 'Fields',
                helpText: 'Only return these fields in each item, as a comma-separated list (e.g. `title,url,price`). '
                    + 'All other fields will be dropped from the result. Leave empty to return all fields. '
                    + 'Takes priority over **Omit** when both are set.',
                key: 'fields',
                required: false,
                type: 'string',
                group: 'advanced',
            },
            {
                label: 'Omit',
                helpText: 'Remove these fields from each item, as a comma-separated list (e.g. `_id,createdAt`). '
                    + 'All other fields will be kept. Leave empty to return all fields. '
                    + 'Ignored for any field that is also listed in **Fields**.',
                key: 'omit',
                required: false,
                type: 'string',
                group: 'advanced',
            },
        ],

        perform: getItems,
        sample: DATASET_SAMPLE,
        outputFields: [
            ...DATASET_OUTPUT_FIELDS,
            getAdditionalDatasetItemsOutputFields,
        ],
    },
};
