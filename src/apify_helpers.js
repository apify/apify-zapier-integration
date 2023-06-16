const _ = require('lodash');
const { WEBHOOK_EVENT_TYPE_GROUPS, BUILD_TAG_LATEST } = require('@apify/consts');
const { APIFY_API_ENDPOINTS, DEFAULT_KEY_VALUE_STORE_KEYS, LEGACY_PHANTOM_JS_CRAWLER_ID,
    OMIT_ACTOR_RUN_FIELDS, FETCH_DATASET_ITEMS_ITEMS_LIMIT, ALLOWED_MEMORY_MBYTES_LIST,
    DEFAULT_ACTOR_MEMORY_MBYTES } = require('./consts');
const { wrapRequestWithRetries } = require('./request_helpers');

const createDatasetUrls = (datasetId, cleanParamName) => {
    const createDatasetUrl = (format) => {
        return `${APIFY_API_ENDPOINTS.datasets}/${datasetId}/items?${cleanParamName}=true&attachment=true&format=${format}`;
    };
    return {
        xml: createDatasetUrl('xml'),
        csv: createDatasetUrl('csv'),
        json: createDatasetUrl('json'),
        xlsx: createDatasetUrl('xlsx'),
        html: createDatasetUrl('html'),
        rss: createDatasetUrl('rss'),
    };
};

/**
 * Get items from dataset and urls to file attachments. If there are more than limit items,
 * it will attach item with info about reaching limit.
 */
// eslint-disable-next-line default-param-last
const getDatasetItems = async (z, datasetId, params = {}, actorId, runFromTrigger = false) => {
    /**
     * For backwards compatible with old phantomJs crawler we need to use
     * simplified dataset instead of clean.
     */
    let cleanParamName = 'clean';
    if (actorId === LEGACY_PHANTOM_JS_CRAWLER_ID) {
        cleanParamName = 'simplified';
    }
    params[cleanParamName] = true;

    const itemsResponse = await wrapRequestWithRetries(z.request, {
        url: `${APIFY_API_ENDPOINTS.datasets}/${datasetId}/items`,
        params,
    });

    const totalItemsCount = itemsResponse.getHeader('x-apify-pagination-total');
    const items = JSON.parse(itemsResponse.content);

    // TODO: Add limit and skip options into triggers input and remove this warning.
    if (runFromTrigger && params.limit && totalItemsCount > params.limit) {
        items.push({
            warning: `Some items were omitted! The maximum number of items you can get is ${params.limit}. `
                + 'If you want to get more items you need to add action "Fetch Dataset Items" with run.defaultDatasetId with dataset ID set.',
        });
    }

    return {
        items,
        itemsFileUrls: createDatasetUrls(datasetId, cleanParamName),
    };
};

/**
 * Get values from key-value store, it skips all non json values.
 */
const getValuesFromKeyValueStore = async (z, storeId, keys) => {
    const values = {};

    await Promise.all(keys.map((key) => {
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
    }));

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
        run = { ...run, ...keyValueStoreValues };
    }

    if (defaultDatasetId) {
        const datasetItems = await getDatasetItems(z, defaultDatasetId, { limit: FETCH_DATASET_ITEMS_ITEMS_LIMIT }, run.actId, true);
        run.datasetItems = datasetItems.items;
        run.datasetItemsFileUrls = datasetItems.itemsFileUrls;
    }

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
        eventTypes: WEBHOOK_EVENT_TYPE_GROUPS.ACTOR_RUN_TERMINAL,
        condition,
        requestUrl: bundle.targetUrl,
    };
    const response = await wrapRequestWithRetries(z.request, {
        url: APIFY_API_ENDPOINTS.webhooks,
        method: 'POST',
        json: webhookOpts,
    });

    return response.data;
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
        store = storeResponse.data;
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
        store = storeResponse.data;
    }
    return store;
};

/**
 * It pickes from input schema prefill values.
 * NOTE: Input schema was validated on app, we don't have to check structure here.
 * @param inputSchemaStringJSON
 */
const getPrefilledValuesFromInputSchema = (inputSchemaStringJSON) => {
    const prefilledObject = {};
    const { properties } = JSON.parse(inputSchemaStringJSON);

    Object.keys(properties).forEach((propKey) => {
        if (properties[propKey].prefill) prefilledObject[propKey] = properties[propKey].prefill;
        else if (properties[propKey].type === 'boolean' && _.isBoolean(properties[propKey].default)) {
            prefilledObject[propKey] = properties[propKey].default;
        }
    });

    return prefilledObject;
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

    const actor = actorResponse.data;
    const { build, timeoutSecs, memoryMbytes } = actor.defaultRunOptions;
    const defaultActorBuildTag = build || BUILD_TAG_LATEST;

    let inputBody;
    let inputContentType;
    let inputSchema;
    // Get input schema from build
    const defaultBuild = actor.taggedBuilds && actor.taggedBuilds[defaultActorBuildTag];
    if (defaultBuild) {
        const buildResponse = await wrapRequestWithRetries(z.request, {
            url: `${APIFY_API_ENDPOINTS.actors}/${actorId}/builds/${defaultBuild.buildId}`,
        });
        inputSchema = buildResponse.data && buildResponse.data.inputSchema;
        if (inputSchema) {
            inputContentType = 'application/json; charset=utf-8';
            inputBody = JSON.stringify(getPrefilledValuesFromInputSchema(inputSchema), null, 2);
        }
    }

    // Parse and stringify json input body if there is
    if (actor.exampleRunInput && !inputSchema) {
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

    let inputBodyHelpText = 'Input configuration for the actor.';
    if (actor.isPublic) {
        inputBodyHelpText += ` See [documentation](https://apify.com/${actor.username}/${actor.name}?section=input-schema) `
            + 'for detailed fields description.';
    }

    return [
        {
            label: 'Input body',
            helpText: inputBodyHelpText,
            key: 'inputBody',
            required: false,
            default: inputBody || '',
            type: 'text', // NICE TO HAVE: Input type 'file' regarding content type
        },
        {
            label: 'Input content type',
            helpText: 'Specifies the `Content-Type` for the actor input body, e.g. `application/json`.',
            key: 'inputContentType',
            required: false,
            default: inputContentType || '',
            type: 'string',
        },
        {
            label: 'Build',
            helpText: 'Tag or number of the build that you want to run, e.g. `latest`, `beta` or `1.2.34`.',
            key: 'build',
            required: false,
            default: defaultActorBuildTag,
            type: 'string',
        },
        {
            label: 'Timeout',
            helpText: 'Timeout for the actor run in seconds. If `0` '
                + 'there will be no timeout and the actor will run until completion, perhaps forever.',
            key: 'timeoutSecs',
            required: false,
            default: timeoutSecs || 0,
            type: 'integer',
        },
        {
            label: 'Memory',
            helpText: 'Amount of memory allocated for the actor run, in megabytes. The more memory, the faster your actor will run.',
            key: 'memoryMbytes',
            required: false,
            // NOTE: Zapier UI allows only choices with strings
            default: (memoryMbytes || DEFAULT_ACTOR_MEMORY_MBYTES).toString(),
            choices: ALLOWED_MEMORY_MBYTES_LIST.map((val) => val.toString()),
            type: 'string',
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
    getPrefilledValuesFromInputSchema,
};
