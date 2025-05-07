const { APIFY_API_ENDPOINTS } = require('../consts');
const { getOrCreateKeyValueStore } = require('../apify_helpers');
const { wrapRequestWithRetries } = require('../request_helpers');

const stashFunction = (z, bundle) => {
    const { contentLength, contentType, storeId, key } = bundle.inputData;
    const filePromise = z.request({
        url: `${APIFY_API_ENDPOINTS.keyValueStores}/${storeId}/records/${key}`,
        method: 'GET',
        raw: true,
    });
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

    let data;

    const PARSEABLE_MIMES = ['application/json', 'text/plain'];

    // Maximum HTTP response payload = 20MB
    if (PARSEABLE_MIMES.includes(contentType) && contentLength < 20 * (1000 ** 2)) {
        const response = await z.request({
            url: `${APIFY_API_ENDPOINTS.keyValueStores}/${store.id}/records/${key}`,
            method: 'GET',
        });
        if (typeof response.data === 'object' && !Array.isArray(response.data) && response.data !== null) {
            data = response.data;
        } else {
            data = { value: response.data ?? null };
        }
    } else {
        // There is a hard limit of 150MB on the size of dehydrated files.
        // Depending on the complexity of the app, issues can also occur for files over ~100MB
        if (contentLength > 120 * (1000 ** 2)) {
            throw new Error('File size exceeds Zapier operating constraints.');
        }
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
