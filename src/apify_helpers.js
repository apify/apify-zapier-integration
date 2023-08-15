const _ = require('lodash');
const { WEBHOOK_EVENT_TYPE_GROUPS, BUILD_TAG_LATEST } = require('@apify/consts');
const { APIFY_API_ENDPOINTS, DEFAULT_KEY_VALUE_STORE_KEYS, LEGACY_PHANTOM_JS_CRAWLER_ID,
    OMIT_ACTOR_RUN_FIELDS, FETCH_DATASET_ITEMS_ITEMS_LIMIT, ALLOWED_MEMORY_MBYTES_LIST,
    DEFAULT_ACTOR_MEMORY_MBYTES } = require('./consts');
const { wrapRequestWithRetries } = require('./request_helpers');

// Key of field to use internally to compute changes in fields.
const ACTOR_ID_REFERENCE_FIELD_KEY = 'referenceActorId';

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
        const url = `${APIFY_API_ENDPOINTS.keyValueStores}/${storeId}/records/${key}`;
        return z
            .request(url)
            .then((response) => {
                if (response.status === 404) {
                    values[key] = {
                        error: `Cannot find "${key}" in the key-value store`,
                    };
                    return;
                }
                const contentType = response.getHeader('content-type');
                if (contentType.includes('application/json')) {
                    try {
                        const maybeObject = JSON.parse(response.content);
                        values[key] = maybeObject;
                    } catch (err) {
                        values[key] = {
                            error: `Cannot parse the key-value store record: ${err.message}`,
                        };
                    }
                } else {
                    // Treat all other content types as files.
                    values[key] = {
                        file: url,
                        filename: key,
                        contentType,
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
        ? `https://console.apify.com/actors/tasks/${run.actorTaskId}/runs/${run.id}`
        : `https://console.apify.com/actors/${run.actId}/runs/${run.id}`;

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
 * It picks from input schema prefill values.
 * NOTE: Input schema was validated on app, we don't have to check structure here.
 * @param inputSchema
 */
const getPrefilledValuesFromInputSchema = (inputSchema) => {
    const prefilledObject = {};
    const { properties } = inputSchema;

    Object.keys(properties).forEach((propKey) => {
        if (properties[propKey].prefill) prefilledObject[propKey] = properties[propKey].prefill;
        else if (properties[propKey].type === 'boolean' && _.isBoolean(properties[propKey].default)) {
            prefilledObject[propKey] = properties[propKey].default;
        }
    });

    return prefilledObject;
};

/**
 * Prefix input field key with input string.
 * @param fieldKey
 * @returns string
 */
const prefixInputFieldKey = (fieldKey) => {
    return `input-${fieldKey}`;
};

/**
 * Parse input field key to get original key.
 * @param fieldKey
 * @returns string
 */
const parseInputFieldKey = (fieldKey) => {
    return fieldKey.replace('input-', '');
};

/**
 * Converts Apify input schema to Zapier input fields.
 * Input schema spec.
 * https://docs.apify.com/platform/actors/development/actor-definition/input-schema Fields schema
 * spec. https://zapier.github.io/zapier-platform-schema/build/schema.html#fieldschema
 * @param inputSchema
 * @param actor
 */
const createFieldsFromInputSchemaV1 = (inputSchema, actor) => {
    const { properties, required, description } = inputSchema;
    const fields = [
        // The first fies is info box with input schema description or actor title, same as on Apify platform.
        {
            label: actor.title,
            key: prefixInputFieldKey(`actor-${actor.id}-info`),
            type: 'copy',
            helpText: description || `${actor.title} Input, see [documentation](https://apify.com/${actor.username}/${actor.name}) `
                + 'for detailed fields description.',
        },
    ];
    // eslint-disable-next-line no-restricted-syntax
    for (const [propertyKey, definition] of Object.entries(properties)) {
        // eslint-disable-next-line no-continue
        if (definition.editor === 'hidden') continue;
        // NOTE: Handle sectionCaption with info box with helpText. It is not possible to do stackable fields in Zapier.
        if (definition.sectionCaption && definition.sectionCaption.length) {
            const helpText = definition.sectionDescription
                ? `${definition.sectionCaption} - ${definition.sectionDescription}`
                : definition.sectionCaption;
            fields.push({
                label: definition.sectionCaption,
                key: prefixInputFieldKey(`sectionCaption-${propertyKey}`),
                type: 'copy',
                helpText,
            });
        }
        const field = {
            label: definition.title,
            helpText: definition.description,
            key: prefixInputFieldKey(propertyKey),
            required: required && required.includes(propertyKey),
            // NOTE: From Zapier docs: A default value that is saved the first time a Zap is created.
            // It is what what prefill is in Apify input schema.
            default: definition.prefill,
            // NOTE: From Zapier docs: An example value that is not saved.
            // It is what what default is in Apify input schema.
            placeholder: definition.default,
        };
        switch (definition.type) {
            case 'string': {
                // NOTE: Cannot provide alternative in fields schema for options pattern, minLength, maxLength, nullable
                // These options will not cover UI validation and we need to handle it in code.
                field.type = 'string'; // editor = textfield, datepicker
                if (['javascript', 'python'].includes(definition.editor)) {
                    field.type = 'code';
                } else if (definition.editor === 'textarea') {
                    field.type = 'text';
                } else if (definition.editor === 'datepicker') {
                    field.type = 'datetime';
                } else if (definition.editor === 'select') {
                    field.choices = {};
                    definition.enum.forEach((key, i) => {
                        field.choices[key] = definition.enumTitles ? definition.enumTitles[i] : key;
                    });
                }
                if (definition.isSecret) {
                    field.type = 'password';
                }
                break;
            }
            case 'integer': {
                // NOTE: Cannot provide alternative in fields schema for options maximum, minimum, unit, nullable
                field.type = 'integer';
                break;
            }
            case 'boolean':
                // NOTE: Cannot provide alternative in fields schema for options groupCaption, groupDescription, nullable
                field.type = 'boolean';
                break;
            case 'array': {
                const parsedPrefillValue = definition.prefill;
                const parsedDefaultValue = definition.default;
                // NOTE: Cannot provide alternative in fields schema for options placeholderKey, placeholderValue, patternKey,
                // patternValue, maxItems, minItems, uniqueItems, nullable
                if (definition.editor === 'json' || definition.editor === 'keyValue') {
                    field.type = 'text';
                    if (parsedPrefillValue) field.default = JSON.stringify(parsedPrefillValue, null, 2);
                    else if (parsedDefaultValue) field.placeholder = JSON.stringify(parsedDefaultValue, null, 2);
                } else if (['requestListSources', 'pseudoUrls', 'globs', 'stringList'].includes(definition.editor)) {
                    // NOTE: These options are not supported in Zapier and Apify UI specific.
                    // We will use stringList type instead for simplicity. We will covert them into spec. format before run.
                    field.type = 'string';
                    field.list = true;
                    // NOTE: List can have just one default value, so pick just first one.
                    if (parsedPrefillValue && Array.isArray(parsedPrefillValue) && parsedPrefillValue[0]) {
                        const firstItem = parsedPrefillValue[0];
                        if (typeof firstItem === 'string') field.default = firstItem;
                        else if (typeof firstItem === 'object') field.default = firstItem.url || firstItem.purl || firstItem.glob;
                        else field.default = firstItem; // NOTE: We do not know what it is, let's print it as it is, but it should not happen.
                        field.placeholder = undefined;
                    } else if (parsedDefaultValue && Array.isArray(parsedDefaultValue) && parsedDefaultValue[0]) {
                        const firstItem = parsedDefaultValue[0];
                        if (typeof firstItem === 'string') field.placeholder = firstItem;
                        else if (typeof firstItem === 'object') field.placeholder = firstItem.url || firstItem.purl || firstItem.glob;
                        else field.placeholder = firstItem; // NOTE: We do not know what it is, let's print it as it is, but it should not happen.
                        field.default = undefined;
                    } else {
                        field.default = undefined;
                        field.placeholder = undefined;
                    }
                }
                break;
            }
            case 'object': {
                if (definition.editor === 'json') {
                    field.type = 'text';
                } else if (definition.editor === 'proxy') {
                    // This field is Apify specific, we do not support nice UI for it. Let's print note about it into UI.
                    fields.push({
                        label: 'Proxy',
                        key: prefixInputFieldKey('proxyWarning'),
                        type: 'copy',
                        helpText: `${definition.title} depends on Apify platform and is not compatible with Zapier integration. `
                            + 'We suggest setting this value in the Apify console',
                    });
                    field.type = 'text';
                }
                if (definition.prefill) {
                    field.default = JSON.stringify(definition.prefill, null, 2);
                } else if (field.default) {
                    field.placeholder = JSON.stringify(definition.default, null, 2);
                }
                break;
            }
            default: {
                // This should not happen.
                console.log(`Unknown input schema type: ${definition.type}`, definition);
                // eslint-disable-next-line no-continue
                continue;
            }
        }
        fields.push(field);
    }
    return fields;
};

const maybeGetInputSchemaFromActor = async (z, actor, buildTag) => {
    const defaultBuild = actor.taggedBuilds && actor.taggedBuilds[buildTag];
    if (defaultBuild) {
        const buildResponse = await wrapRequestWithRetries(z.request, {
            url: `${APIFY_API_ENDPOINTS.actors}/${actor.id}/builds/${defaultBuild.buildId}`,
        });
        const inputSchemaJSON = buildResponse.data && buildResponse.data.inputSchema;
        try {
            return JSON.parse(inputSchemaJSON);
        } catch (err) {
            // This should never happen, but if it does, we will ignore it
            // and continue without input schema.
        }
    }
};

/**
 * This method loads additional input fields regarding actor default values.
 */
const getActorAdditionalFields = async (z, bundle) => {
    const { actorId } = bundle.inputData;
    if (!actorId) return []; // Actor not selected yet, no additional fields to load.

    const previousActorId = bundle.inputData[ACTOR_ID_REFERENCE_FIELD_KEY];
    const wasActorChanged = actorId !== previousActorId; // If Actor ID changed from the last input field generation.

    const actorResponse = await wrapRequestWithRetries(z.request, {
        url: `${APIFY_API_ENDPOINTS.actors}/${actorId}`,
    });

    const actor = actorResponse.data;
    const { build: defaultBuild, timeoutSecs, memoryMbytes } = actor.defaultRunOptions;
    const actorBuildTag = wasActorChanged
        ? defaultBuild || BUILD_TAG_LATEST
        : bundle.inputData.build || defaultBuild || BUILD_TAG_LATEST;

    let inputBody;
    let inputContentType;
    // Get input schema from build
    const inputSchema = await maybeGetInputSchemaFromActor(z, actor, actorBuildTag);
    if (inputSchema) {
        inputContentType = 'application/json; charset=utf-8';
        inputBody = JSON.stringify(getPrefilledValuesFromInputSchema(inputSchema), null, 2);
    }

    const baseFields = [
        {
            label: 'Reference Actor ID',
            key: ACTOR_ID_REFERENCE_FIELD_KEY,
            helpText: 'ID of Actor the UI was generated for.',
            type: 'string',
            default: actorId,
            computed: true, // This field is hidden in UI, used for checking if actorId change between input fields generation.
        },
        {
            label: 'Build',
            helpText: 'Tag or number of the build that you want to run, e.g. `latest`, `beta` or `1.2.34`.',
            key: 'build',
            required: false,
            default: actorBuildTag,
            // NOTE: Change build value recomputes fields as input schema can change.
            altersDynamicFields: true,
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

    if (inputSchema && (inputSchema.schemaVersion === 1 || !inputSchema.schemaVersion)) {
        const fieldsFromInputSchema = createFieldsFromInputSchemaV1(inputSchema, actor);
        return [
            ...fieldsFromInputSchema,
            {
                label: 'Options',
                key: `actor-${actor.id}-options`,
                type: 'copy',
                helpText: 'Actor options, see [documentation](https://docs.apify.com/platform/actors/running/usage-and-resources)'
                    + ' for detailed description.',
            },
            ...baseFields,
        ];
    }

    // Parse and stringify json input body if there is
    const isContentTypeJson = inputContentType && inputContentType.includes('application/json');
    if (actor.exampleRunInput) {
        const { body, contentType } = actor.exampleRunInput;
        inputContentType = contentType;
        // Try to parse JSON body
        if (isContentTypeJson) {
            try {
                const parsedBody = JSON.parse(body);
                inputBody = JSON.stringify(parsedBody, null, 2);
            } catch (err) {
                // There can be invalid JSON, but show must go on.
                inputBody = body;
            }
        } else {
            inputBody = body;
        }
    }
    let inputBodyHelpText = 'Input configuration for the actor.';
    if (actor.isPublic) {
        inputBodyHelpText += ` See [documentation](https://apify.com/${actor.username}/${actor.name}/input-schema) `
                + 'for detailed fields description.';
    }
    return [
        {
            label: `Input body${isContentTypeJson ? ' (JSON)' : ''}`,
            helpText: inputBodyHelpText,
            key: 'inputBody',
            required: false,
            default: inputBody ?? isContentTypeJson ? '{}' : '',
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
        ...baseFields,
    ];
};

const printPrettyActorOrTaskName = (actorOrTask) => {
    const idLikeName = actorOrTask.username ? `${actorOrTask.username}/${actorOrTask.name}` : actorOrTask.name;
    return actorOrTask.title
        ? `${actorOrTask.title} (${idLikeName})`
        : idLikeName;
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
    createFieldsFromInputSchemaV1,
    maybeGetInputSchemaFromActor,
    printPrettyActorOrTaskName,
    parseInputFieldKey,
    prefixInputFieldKey,
};
