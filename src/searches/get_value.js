const { APIFY_API_ENDPOINTS } = require('../consts');
const { getOrCreateKeyValueStore } = require('../apify_helpers');
const { wrapRequestWithRetries } = require('../request_helpers');

const getRecord = (z, options) => {
    const { storeId, key, raw } = options;
    return z.request({
        url: `${APIFY_API_ENDPOINTS.keyValueStores}/${storeId}/records/${key}`,
        method: 'GET',
        raw,
    });
};

const stashFunction = (z, bundle) => {
    const { contentLength, contentType, key } = bundle.inputData;
    const filePromise = getRecord(z, bundle);
    return z.stashFile(filePromise, contentLength, key, contentType);
};

const getValue = async (z, bundle) => {
    const { storeIdOrName, key } = bundle.inputData;
    const store = await getOrCreateKeyValueStore(z, storeIdOrName);

    const sizeRequest = await wrapRequestWithRetries(z.request, {
        url: `${APIFY_API_ENDPOINTS.keyValueStores}/${store.id}/records/${key}`,
        method: 'HEAD',
    });

    if (sizeRequest.status === 404) {
        return [];
    }

    const contentType = sizeRequest.getHeader('content-type');
    const contentLength = sizeRequest.getHeader('content-length');

    // najit velky soubor 100mb±

    let data;
    if (contentType === 'application/json' && contentLength < 20 * (1000 ** 2)) {
        bundle.inputData = { storeId: store.id, key, raw: false };
        const response = await getRecord(z, { storeId: store.id, key, raw: false });
        if (typeof response.data === 'object' && !Array.isArray(response.data) && response.data !== null) {
            data = response.data;
        } else {
            data = { value: response.data ?? null };
        }
    } else {
        const pointer = z.dehydrateFile(stashFunction, { storeId: store.id, key, raw: true, contentLength, contentType });
        data = {
            contentType,
            value: pointer,
        };
    }

    return [data];
};

module.exports = {
    hydrators: {
        stashFunction,
    },
    perform: {
        key: 'keyValueStoreGetValue',
        noun: 'Key-value Store Value',
        display: {
            label: 'Get Key-Value Store Record',
            description: 'Gets a record from a key-value store.',
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
            sample: {
                key: 'This is the sample value from key-value store.',
            },
        },
    },

};
