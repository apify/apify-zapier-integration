const { APIFY_API_ENDPOINTS } = require('../consts');
const { wrapRequestWithRetries } = require('../request_helpers');
const { getOrCreateKeyValueStore } = require('../apify_helpers');

const setValue = async (z, bundle) => {
    const { storeIdOrName, key, value } = bundle.inputData;

    const store = await getOrCreateKeyValueStore(z, storeIdOrName);

    await wrapRequestWithRetries(z.request, {
        url: `${APIFY_API_ENDPOINTS.keyValueStores}/${store.id}/records/${key}`,
        method: 'PUT',
        json: value,
    });

    return {
        keyValueStore: store,
        key,
        value,
    };
};

module.exports = {
    key: 'keyValueStoreSetValue',
    noun: 'Key-value Store Value',
    display: {
        label: 'Set Key-value Store Value',
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
                type: 'dict',
            },
        ],

        perform: setValue,
    },
};
