const { APIFY_API_ENDPOINTS } = require('../consts');
const { wrapRequestWithRetries } = require('../request_helpers');
const { getOrCreateKeyValueStore } = require('../apify_helpers');

const setValue = async (z, bundle) => {
    const { storeIdOrName, key, value } = bundle.inputData;
    const store = await getOrCreateKeyValueStore(z, storeIdOrName);
    const keyValueStoreValueUrl = `${APIFY_API_ENDPOINTS.keyValueStores}/${store.id}/records/${key}`;

    let valueObject;
    try {
        valueObject = JSON.parse(value);
    } catch (err) {
        throw new Error('Cannot parse value as JSON object.');
    }

    await wrapRequestWithRetries(z.request, {
        url: keyValueStoreValueUrl,
        method: 'PUT',
        json: valueObject,
    });

    return {
        keyValueStore: store,
        keyValueStoreValueUrl,
    };
};

module.exports = {
    key: 'keyValueStoreSetValue',
    noun: 'Key-Value Store Value',
    display: {
        label: 'Set Key-Value Store Value',
        description: 'Set value to key-value store.',
    },

    operation: {
        inputFields: [
            {
                label: 'Key-value store',
                helpText: 'Key-value store ID or name. If a store doesn\'t exist, it is created.',
                key: 'storeIdOrName',
                required: true,
            },
            {
                label: 'Key',
                key: 'key',
                required: true,
                type: 'string',
            },
            {
                label: 'Value',
                helpText: 'Key-value object can be set as the value. The content-type for this value will be application/json by default.',
                key: 'value',
                required: true,
                type: 'text',
                default: '{}',
            },
        ],

        perform: setValue,
    },
};
