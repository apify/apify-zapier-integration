const Promise = require('bluebird');
const { WEBHOOK_EVENT_TYPES } = require('apify-shared/consts');
const { APIFY_API_ENDPOINTS, DEFAULT_KEY_VALUE_STORE_KEYS, LEGACY_PHANTOM_JS_CRAWLER_ID } = require('./consts');
const { wrapRequestWithRetries } = require('./request_helpers');

/**
 * Get items from dataset. If there are more than limit items,
 * it will attach item with info about reaching limit.
 */
const getDatasetItems = async (z, datasetId, params = {}, actorId) => {
    /**
     * For backwards compatible with old phantomJs crawler we need to use
     * simplified dataset instead of clean.
     */
    if (actorId && actorId === LEGACY_PHANTOM_JS_CRAWLER_ID) {
        params.simplified = true;
    } else {
        params.clean = true;
    }

    const itemsResponse = await wrapRequestWithRetries(z.request, {
        url: `${APIFY_API_ENDPOINTS.datasets}/${datasetId}/items`,
        params,
    });

    const totalItemsCount = itemsResponse.getHeader('x-apify-pagination-total');
    const items = JSON.parse(itemsResponse.content); // NOTE: It looks itemsResponse.json, can not work with json array.

    if (params.limit && totalItemsCount > params.limit) {
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
                if (response.status === 404) {
                    values[key] = {
                        error: `Cannot find ${key} in key-value store`,
                    };
                    return;
                }
                try {
                    const maybeObject = JSON.parse(response.content);
                    values[key] = maybeObject;
                } catch (err) {
                    values[key] = {
                        error: `Cannot parse key-value store item: ${err.message}`,
                    };
                }
            });
    });

    return values;
};

/**
 * Enriches actor run object with data from dataset and key-value store.
 * It is used for actor runs same as task runs.
 */
const enrichActorRun = async (z, run, storeKeysToInclude = []) => {
    const { defaultKeyValueStoreId, defaultDatasetId } = run;

    if (defaultKeyValueStoreId) {
        const keys = storeKeysToInclude.concat(DEFAULT_KEY_VALUE_STORE_KEYS);
        const keyValueStoreValues = await getValuesFromKeyValueStore(z, defaultKeyValueStoreId, keys);
        run = Object.assign({}, run, keyValueStoreValues);
    }

    if (defaultDatasetId) run.datasetItems = await getDatasetItems(z, defaultDatasetId, { limit: 500 }, run.actId);

    return run;
};

// Process to subscribe to Apify webhook
const subscribeWebkook = async (z, bundle, condition) => {
    const webhookOpts = {
        eventTypes: Object.values(WEBHOOK_EVENT_TYPES),
        condition,
        requestUrl: bundle.targetUrl,
    };
    const response = await wrapRequestWithRetries(z.request, {
        url: APIFY_API_ENDPOINTS.webhooks,
        method: 'POST',
        json: webhookOpts,
    });

    return response.json;
};

// Process to unsubscribe to Apify webhook
const unsubscribeWebhook = async (z, bundle) => {
    // bundle.subscribeData contains the parsed response JSON from the subscribe
    const webhookId = bundle.subscribeData.id;

    await wrapRequestWithRetries(z.request, {
        url: `${APIFY_API_ENDPOINTS.webhooks}/${webhookId}`,
        method: 'DELETE',
    });

    return {};
};

// Gets actor run from bundle clean request and enriches it.
const getActorRun = async (z, bundle) => {
    const run = bundle.cleanedRequest.resource;
    const enrichRun = await enrichActorRun(z, run);
    return [enrichRun];
};

/**
 * Get store by ID or by name
 * @param z
 * @param storeIdOrName - Key-value store ID or name
 */
const getOrCreateKeyValueStore = async (z, storeIdOrName) => {
    let store;
    // The first try to get store by ID.
    try {
        const storeResponse = await wrapRequestWithRetries(z.request, {
            url: `${APIFY_API_ENDPOINTS.keyValueStores}/${storeIdOrName}`,
            method: 'GET',
        });
        store = storeResponse.json;
    } catch (err) {
        if (!err.message.includes('not found')) throw err;
    }

    // The second creates store with name, in case storeId not found.
    if (!store) {
        const storeResponse = await wrapRequestWithRetries(z.request, {
            url: `${APIFY_API_ENDPOINTS.keyValueStores}`,
            method: 'POST',
            params: {
                name: storeIdOrName,
            },
        });
        store = storeResponse.json;
    }
    return store;
};

module.exports = {
    enrichActorRun,
    subscribeWebkook,
    unsubscribeWebhook,
    getActorRun,
    getOrCreateKeyValueStore,
    getDatasetItems,
};
