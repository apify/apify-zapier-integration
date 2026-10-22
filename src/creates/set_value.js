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
        throw new Error(`The record value is not valid JSON: ${err.message}. Please provide a valid JSON object.`);
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
        description: 'Creates or updates a record in a key-value store. '
            + 'Agents can use it as memory: save data here and read it later with Get Key-Value Store Record.',
    },

    operation: {
        inputFields: [
            {
                label: 'Key-value store',
                helpText: 'Name or ID of the key-value store. If no store with that name exists, a new one is created. '
                    + 'An unknown ID returns an error.',
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
                helpText: 'A JSON value. The record is saved with `Content-Type: application/json`.',
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
