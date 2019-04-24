const { APIFY_API_ENDPOINTS, LEGACY_PHANTOM_JS_CRAWLER_ID } = require('../consts');
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

    const items = await getDatasetItems(z, dataset.id, { limit, offset }, dataset.actId);
    const cleanParamName = dataset.actId === LEGACY_PHANTOM_JS_CRAWLER_ID ? 'simplified' : 'clean';

    const createDatasetUrl = (format) => {
        return `${APIFY_API_ENDPOINTS.datasets}/${dataset.id}/items?${cleanParamName}=true&attachment=true&forma=${format}`;
    };

    return [{
        ...dataset,
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
        description: 'Download items from Apify dataset.',
    },

    operation: {
        inputFields: [
            {
                label: 'Dataset',
                helpText: 'Dataset ID or name.',
                key: 'datasetIdOrName',
                required: true,
            },
            {
                label: 'Limit',
                key: 'limit',
                required: false,
                type: 'integer',
            },
            {
                label: 'Offset',
                key: 'offset',
                required: false,
                type: 'integer',
            },
        ],

        perform: getItems,
    },
};
