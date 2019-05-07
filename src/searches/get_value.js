const { APIFY_API_ENDPOINTS } = require('../consts');
const { getOrCreateKeyValueStore } = require('../apify_helpers');
const { wrapRequestWithRetries } = require('../request_helpers');

const getValue = async (z, bundle) => {
    const { storeIdOrName, key } = bundle.inputData;
    const store = await getOrCreateKeyValueStore(z, storeIdOrName);

    const recordResponse = await wrapRequestWithRetries(z.request, {
        url: `${APIFY_API_ENDPOINTS.keyValueStores}/${store.id}/records/${key}`,
        method: 'GET',
    });

    if (recordResponse.status === 404) {
        throw new Error('Nothing could be found for the key.');
    }

    if (!recordResponse.json) throw new Error('The value is not JSON object.');

    return [recordResponse.json];
};

module.exports = {
    key: 'keyValueStoreGetValue',
    noun: 'Key-value Store Value',
    display: {
        label: 'Get Key-Value Store Record',
        description: 'Get a record from a key-value store.',
    },

    operation: {
        inputFields: [
            {
                label: 'Key-value store',
                helpText: 'Key-value store ID or name.',
                key: 'storeIdOrName',
                required: true,
            },
            {
                label: 'Record key',
                key: 'key',
                required: true,
                type: 'string',
            },
        ],

        perform: getValue,
    },
};
