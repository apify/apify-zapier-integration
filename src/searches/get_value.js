const { APIFY_API_ENDPOINTS } = require('../consts');
const { findStorageOrThrow } = require('../apify_helpers');
const { wrapRequestWithRetries } = require('../request_helpers');

const KEY_VALUE_STORE_LOOKUP = {
    apiUrl: APIFY_API_ENDPOINTS.keyValueStores,
    consoleUrl: 'https://console.apify.com/storage/key-value-stores',
    label: 'Key-value store',
};

const stashFunction = async (z, bundle) => {
    const { contentType, storeId, key } = bundle.inputData;

    try {
        const response = await z.request({
            url: `${APIFY_API_ENDPOINTS.keyValueStores}/${storeId}/records/${key}`,
            method: 'GET',
            raw: true,
        });

        const responseBuffer = await response.buffer();

        const fileContent = responseBuffer;
        const finalContentLength = responseBuffer.length;

        return z.stashFile(fileContent, finalContentLength, key, contentType);
    } catch (error) {
        throw new z.errors.Error(`Error during stashing Apify Key-value store record: ${error.message}`);
    }
};

const getValue = async (z, bundle) => {
    const { storeIdOrName, key } = bundle.inputData;
    const store = await findStorageOrThrow(z, storeIdOrName, KEY_VALUE_STORE_LOOKUP);

    const sizeRequest = await wrapRequestWithRetries(z.request, {
        url: `${APIFY_API_ENDPOINTS.keyValueStores}/${store.id}/records/${key}`,
        method: 'HEAD',
    });

    if (sizeRequest.status === 404) {
        throw new z.errors.Error(
            `No record found for key "${key}" in key-value store "${store.id}". `
            + 'The store exists but has no record under that key. Check the key name, '
            + 'or list the store keys in Apify Console: '
            + `https://console.apify.com/storage/key-value-stores/${store.id}`,
        );
    }

    const contentType = sizeRequest.getHeader('content-type');
    const contentLength = sizeRequest.getHeader('content-length');

    let data;

    const PARSEABLE_MIMES = ['application/json', 'text/plain'];

    // Maximum HTTP response payload = 20MB
    if (PARSEABLE_MIMES.some((pattern) => contentType.includes(pattern)) && contentLength < 20 * (1000 ** 2)) {
        const response = await z.request({
            url: `${APIFY_API_ENDPOINTS.keyValueStores}/${store.id}/records/${key}`,
            method: 'GET',
        });
        if (typeof response.data === 'object' && !Array.isArray(response.data) && response.data !== null) {
            data = response.data;
        } else {
            data = { value: (response.data || response.content) ?? null };
        }
    } else {
        // There is a hard limit of 150MB on the size of dehydrated files.
        // Depending on the complexity of the app, issues can also occur for files over ~100MB
        if (contentLength > 120 * (1000 ** 2)) {
            throw new z.errors.Error('File size exceeds Zapier operating constraints.');
        }
        const pointer = z.dehydrateFile(stashFunction, { storeId: store.id, key, contentType });
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
            description: 'Gets a record from a key-value store. '
                + 'Agents can use it as memory: read a value saved earlier with Set Key-Value Store Record.',
        },
        operation: {
            inputFields: [
                {
                    label: 'Key-value store',
                    helpText: 'Name or ID of the key-value store.',
                    key: 'storeIdOrName',
                    required: true,
                },
                {
                    label: 'Record key',
                    helpText: 'If the record is a JSON object, each attribute becomes a separate output field. '
                        + 'Any other record, such as a PDF, image, or plain text, is returned as a file in the `value` field.',
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
