const Promise = require('bluebird');
const { APIFY_API_ENDPOINTS, DEFAULT_KEY_VALUE_STORE_KEYS } = require('./consts');
const { wrapRequestWithRetries } = require('./request_helpers');

/**
 * Get items from dataset. If there are more than limit items,
 * it will attach item with info about reaching limit.
 */
const getDatasetItems = async (z, datasetId, limit) => {
    const itemsResponse = await wrapRequestWithRetries(z.request, {
        url: `${APIFY_API_ENDPOINTS.datasets}/${datasetId}/items`,
        params: {
            limit,
            clean: true,
        },
    });

    const totalItemsCount = itemsResponse.getHeader('x-apify-pagination-total');
    const items = JSON.parse(itemsResponse.content); // NOTE: It looks itemsResponse.json, can not work with json array.

    if (totalItemsCount > limit) {
        items.push({
            warning: `Some items were omitted! The maximum number of items you can get is ${limit}`,
        });
    }

    return items;
};

/**
 * Get values from key-value store, it skips all non json values.
 */
const getValuesFromKeyValueStore = async (z, storeId, keys) => {
    const values = {};

    await Promise.map(keys, (key) => {
        return z
            .request(`${APIFY_API_ENDPOINTS.keyValueStores}/${storeId}/records/${key}`)
            .then((response) => {
                try {
                    const maybeObject = JSON.parse(response.content);
                    values[key] = maybeObject;
                } catch (err) {
                    // Ignore this, it can happen if kvs object is not a JSON.
                }
            })
            .catch((err) => {
                z.console.log(`Skipping error ${err.message}: Can not get ${key} from store ${storeId}`);
            });
    });

    return values;
};

/**
 * Enriches task run object with data from dataset and key-value store.
 */
const enrichTaskRun = async (z, run, storeKeysToInclude = []) => {
    const { defaultKeyValueStoreId, defaultDatasetId } = run;

    if (defaultKeyValueStoreId) {
        const keys = storeKeysToInclude.concat(DEFAULT_KEY_VALUE_STORE_KEYS);
        const keyValueStoreValues = await getValuesFromKeyValueStore(z, defaultKeyValueStoreId, keys);
        run = Object.assign({}, run, keyValueStoreValues);
    }

    if (defaultDatasetId) run.datasetItems = await getDatasetItems(z, defaultDatasetId, 500);

    return run;
};

module.exports = {
    enrichTaskRun,
};
