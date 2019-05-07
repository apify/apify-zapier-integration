const Promise = require('bluebird');
const _ = require('underscore');
const { WEBHOOK_EVENT_TYPES, BUILD_TAG_LATEST } = require('apify-shared/consts');
const { APIFY_API_ENDPOINTS, DEFAULT_KEY_VALUE_STORE_KEYS, LEGACY_PHANTOM_JS_CRAWLER_ID,
    OMIT_ACTOR_RUN_FIELDS, FETCH_DATASET_ITEMS_ITEMS_LIMIT } = require('./consts');
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
    if (actorId === LEGACY_PHANTOM_JS_CRAWLER_ID) {
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
            warning: `Some items were omitted! The maximum number of items you can get is ${params.limit}`,
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
                        error: `Cannot find "${key}" in the key-value store`,
                    };
                    return;
                }
                try {
                    const maybeObject = JSON.parse(response.content);
                    values[key] = maybeObject;
                } catch (err) {
                    values[key] = {
                        error: `Cannot parse the key-value store record: ${err.message}`,
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

    if (defaultDatasetId) run.datasetItems = await getDatasetItems(z, defaultDatasetId, { limit: FETCH_DATASET_ITEMS_ITEMS_LIMIT }, run.actId);

    // Attach Apify app URL to detail of run
    run.detailsPageUrl = run.actorTaskId
        ? `https://my.apify.com/tasks/${run.actorTaskId}#/runs/${run.id}`
        : `https://my.apify.com/actors/${run.actId}#/runs/${run.id}`;

    // Omit fields, which are useless for Zapier users.
    return _.omit(run, OMIT_ACTOR_RUN_FIELDS);
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
    const enrichedRun = await enrichActorRun(z, run);
    return [enrichedRun];
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

/**
 * This method loads additional input fields regarding actor default values.
 */
const getActorAdditionalFields = async (z, bundle) => {
    const { actorId } = bundle.inputData;
    if (!actorId) return [];

    const actorResponse = await wrapRequestWithRetries(z.request, {
        url: `${APIFY_API_ENDPOINTS.actors}/${actorId}`,
    });

    const actor = actorResponse.json;
    const { build, timeoutSecs, memoryMbytes } = actor.defaultRunOptions;
    const defaultActorBuildTag = build || BUILD_TAG_LATEST;

    // Parse and stringify json input body if there is
    let inputBody;
    let inputContentType;
    if (actor.exampleRunInput) {
        const { body, contentType } = actor.exampleRunInput;
        inputContentType = contentType;
        // Try to parse JSON body
        if (contentType.includes('application/json')) {
            try {
                const parsedBody = JSON.parse(body);
                inputBody = JSON.stringify(parsedBody, null, 2);
            } catch (err) {
                // There can be invalid JSON, but show must go on.
                inputBody = body;
            }
        }
    }

    return [
        {
            label: 'Input body',
            helpText: 'Input data for actor.',
            key: 'inputBody',
            required: false,
            default: inputBody || '',
            type: 'text', // NICE TO HAVE: Input type 'file' regarding content type
        },
        {
            label: 'Input content type',
            helpText: 'Content type for actor input body.',
            key: 'inputContentType',
            required: false,
            default: inputContentType || '',
            type: 'string',
        },
        {
            label: 'Build',
            helpText: 'Tag or number of the build that you want to run. It can be something like latest, beta or 1.2.34.',
            key: 'build',
            required: false,
            default: defaultActorBuildTag,
            type: 'string',
        },
        {
            label: 'Timeout',
            helpText: 'Timeout for the actor run in seconds. Zero value means there is no timeout and the actor runs until completion.',
            key: 'timeoutSecs',
            required: false,
            default: timeoutSecs || 0,
            type: 'integer',
        },
        {
            label: 'Memory',
            helpText: 'Amount of memory allocated for the actor run, in megabytes.',
            key: 'memoryMbytes',
            required: false,
            default: memoryMbytes || 1024,
            type: 'integer',
        },
    ];
};

module.exports = {
    enrichActorRun,
    subscribeWebkook,
    unsubscribeWebhook,
    getActorRun,
    getOrCreateKeyValueStore,
    getDatasetItems,
    getActorAdditionalFields,
};
