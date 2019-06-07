const { APIFY_API_ENDPOINTS, KEY_VALUE_STORE_SAMPLE } = require('../consts');
const { wrapRequestWithRetries } = require('../request_helpers');
const { getOrCreateKeyValueStore } = require('../apify_helpers');

const setValue = async (z, bundle) => {
    const { storeIdOrName, key, value } = bundle.inputData;
    const store = await getOrCreateKeyValueStore(z, storeIdOrName);
    const keyValueStoreRecordUrl = `${APIFY_API_ENDPOINTS.keyValueStores}/${store.id}/records/${key}`;

    let valueObject;
    try {
        valueObject = JSON.parse(value);
    } catch (err) {
        throw new Error('Please check that your record value is a valid JSON.');
    }

    await wrapRequestWithRetries(z.request, {
        url: keyValueStoreRecordUrl,
        method: 'PUT',
        json: valueObject,
    });

    return {
        keyValueStore: store,
        keyValueStoreRecordUrl,
    };
};

module.exports = {
    key: 'keyValueStoreSetValue',
    noun: 'Key-Value Store Value',
    display: {
        label: 'Set Key-Value Store Record',
        description: 'Sets a new or updates an existing record to a key-value store.',
        important: true,
    },

    operation: {
        inputFields: [
            {
                label: 'Key-value store',
                // TODO: We need to make sure if user enters ID, we don't create a named store with that ID.
                // That can be checked with regex
                helpText: 'Please enter name or ID of the key-value store. If the store with the name doesn\'t exist, it will be created.',
                key: 'storeIdOrName',
                required: true,
            },
            {
                label: 'Record key',
                key: 'key',
                required: true,
                type: 'string',
            },
            {
                label: 'Record value',
                helpText: 'Please enter a JSON value. The record will have `Content-Type: application/json`.',
                key: 'value',
                required: true,
                type: 'text',
                default: '{}',
            },
        ],

        perform: setValue,
        sample: KEY_VALUE_STORE_SAMPLE,
    },
};
