const _ = require('lodash');
const { APIFY_API_ENDPOINTS, DATASET_PUBLISH_FIELDS,
    DATASET_OUTPUT_FIELDS, DATASET_SAMPLE } = require('../consts');
const { getDatasetItems, findStorageOrThrow } = require('../apify_helpers');
const { getDatasetItemsOutputFields } = require('../output_fields');

const DATASET_LOOKUP = {
    apiUrl: APIFY_API_ENDPOINTS.datasets,
    consoleUrl: 'https://console.apify.com/storage/datasets',
    label: 'Dataset',
};

const getItems = async (z, bundle) => {
    const { datasetIdOrName, limit, offset, fields, omit } = bundle.inputData;
    const dataset = await findStorageOrThrow(z, datasetIdOrName, DATASET_LOOKUP);

    // NOTE: Because testing user had _id instead of id in data and we run integration tests under this user.
    dataset.id = dataset.id || dataset._id;

    const trimFields = (value) => value.split(',').map((f) => f.trim()).join(',');

    const params = { limit, offset };
    if (fields && fields.length) params.fields = trimFields(fields);
    if (omit && omit.length) params.omit = trimFields(omit);

    const datasetItems = await getDatasetItems(z, dataset.id, bundle.authData.access_token, params, dataset.actId);

    if (!datasetItems.items || datasetItems.items.length === 0) {
        throw new z.errors.Error(
            `Dataset "${datasetIdOrName}" has no items${offset ? ` from offset ${offset}` : ''}. `
            + 'Check that the dataset name or ID is correct, or view its contents in Apify Console: '
            + `https://console.apify.com/storage/datasets/${dataset.id}`,
        );
    }

    // Pick some fields to Zapier UI, other fields are useless for Zapier users.
    const cleanDataset = _.pick(dataset, DATASET_PUBLISH_FIELDS);

    return [{
        ...cleanDataset,
        ...datasetItems,
    }];
};

const getAdditionalDatasetItemsOutputFields = async (z, bundle) => {
    const { datasetIdOrName } = bundle.inputData;
    const dataset = await findStorageOrThrow(z, datasetIdOrName, DATASET_LOOKUP);

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
            { key: 'basic', label: 'Basic options', emphasize: true },
            { key: 'advanced', label: 'Advanced options', emphasize: false },
        ],
        inputFields: [
            {
                label: 'Dataset',
                helpText: 'Name or ID of the dataset. To get the results of a run, use the default dataset ID '
                    + 'from a Run Actor or Run Task step, or from a Finished Actor Run or Finished Task Run trigger.',
                key: 'datasetIdOrName',
                required: true,
                group: 'basic',
            },
            {
                label: 'Limit',
                helpText: 'Maximum number of items to return. Leave empty to use the default limit.',
                key: 'limit',
                required: false,
                type: 'integer',
                group: 'basic',
            },
            {
                label: 'Offset',
                helpText: 'Number of items to skip from the start of the dataset. Leave empty to start from the first item.',
                key: 'offset',
                required: false,
                type: 'integer',
                group: 'basic',
            },
            {
                label: 'Fields',
                helpText: 'Comma-separated list of fields to return, e.g. `title,url,price`. Leave empty to return all fields. '
                    + 'Takes priority over **Omit**.',
                key: 'fields',
                required: false,
                type: 'string',
                group: 'advanced',
            },
            {
                label: 'Omit',
                helpText: 'Comma-separated list of fields to remove, e.g. `_id,createdAt`. Leave empty to keep all fields. '
                    + 'Fields also listed in **Fields** are kept.',
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
