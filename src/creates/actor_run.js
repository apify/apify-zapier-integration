const dayjs = require('dayjs');
const {
    APIFY_API_ENDPOINTS,
    ACTOR_RUN_SAMPLE,
    ACTOR_RUN_OUTPUT_FIELDS, ACTOR_SEARCH_SOURCES,
    RECENTLY_USED_ACTORS_KEY,
    DEFAULT_SYNC_RUN_TIMEOUT_SECS,
} = require('../consts');
const {
    enrichActorRun,
    getActorAdditionalFields,
    maybeGetInputSchemaFromActor,
    prefixInputFieldKey,
    slugifyText,
    buildRunCallbackWebhookParam,
    getActorRunOnResume,
} = require('../apify_helpers');
const { wrapRequestWithRetries } = require('../request_helpers');
const { getActorDatasetOutputFields } = require('../output_fields');

const processInputField = (key, value, inputSchema) => {
    const inputSchemaProp = inputSchema.properties[key];
    if (!inputSchemaProp) return value; // This should never happen

    const { editor, title, type } = inputSchemaProp;

    switch (editor) {
        case 'datepicker':
            return dayjs(value).format('YYYY-MM-DD');
        case 'requestListSources':
            return value.map((url) => ({ url: url.trim() }));
        case 'pseudoUrls':
            return value.map((purl) => ({ purl: purl.trim() }));
        case 'globs':
            return value.map((glob) => ({ glob: glob.trim() }));
        case 'proxy':
        case 'json':
        case 'keyValue':
            try {
                return JSON.parse(value);
            } catch (err) {
                throw new Error(`${title} is not a valid JSON, please check it. Error: ${err.message}`);
            }
        case 'schemaBased':
            if (type === 'array') {
                const itemsType = inputSchemaProp.items.type;
                if (['string', 'number', 'boolean', 'integer'].includes(itemsType)) {
                    return value;
                }

                return JSON.parse(value);
            }

            // eslint-disable-next-line no-case-declarations
            const result = {};
            // eslint-disable-next-line no-restricted-syntax
            for (const [propKey, propValue] of Object.entries(value[0])) {
                const realPropKey = propKey.substring(propKey.indexOf('.') + 1); // propKey is like "input-my-object.key1 but can have more dots
                result[realPropKey] = processInputField(realPropKey, propValue, inputSchemaProp);
            }
            return result;
        default:
            return value;
    }
};

// API wordings: "Actor was not found", "Actor was not found or access denied" (ID form),
// "Actor with this name was not found" (username~name form). Anchored, because matching just
// "actor" + "not found" would also swallow missing build and run errors.
const ACTOR_NOT_FOUND_MESSAGE_REGEX = /^actor (?:with this name )?was not found/;

/** Rethrows a generic "not found" API error with the Actor ID + console link; other errors pass through. */
const requestActorOrThrowNotFound = async (z, options, actorId) => {
    try {
        return await wrapRequestWithRetries(z.request, options);
    } catch (err) {
        const message = (err.message || '').toLowerCase();
        if (ACTOR_NOT_FOUND_MESSAGE_REGEX.test(message)) {
            throw new Error(
                `Actor "${actorId}" was not found. Check that the Actor ID or name is correct `
                + 'and that your Apify account has access to it: '
                + `https://console.apify.com/actors/${actorId}`,
            );
        }
        throw err;
    }
};

const runActor = async (z, bundle) => {
    const { actorId, runSync, inputBody, inputContentType, build, timeoutSecs, memoryMbytes } = bundle.inputData;

    const requestOpts = {
        url: `${APIFY_API_ENDPOINTS.actors}/${actorId}/runs`,
        method: 'POST',
        params: {
            build,
            timeout: timeoutSecs,
            memory: parseInt(memoryMbytes, 10),
        },
    };

    if (inputContentType) {
        requestOpts.headers = {
            'Content-Type': inputContentType,
        };
    }
    if (inputBody !== undefined) {
        if (inputContentType && inputContentType.includes('application/json')) {
            try {
                JSON.parse(inputBody);
            } catch (err) {
                throw new Error(`The Input body is not valid JSON: ${err.message}. Please provide a valid JSON object.`);
            }
        }
        requestOpts.body = inputBody;
    } else {
        const actorResponse = await requestActorOrThrowNotFound(z, {
            url: `${APIFY_API_ENDPOINTS.actors}/${actorId}`,
        }, actorId);
        const inputSchema = await maybeGetInputSchemaFromActor(z, actorResponse.data, build);
        if (inputSchema) {
            const input = {};
            const inputSchemaKeys = Object.keys(inputSchema.properties);
            inputSchemaKeys.forEach((key) => {
                const fieldKey = prefixInputFieldKey(key);
                const fieldTitle = prefixInputFieldKey(slugifyText(inputSchema.properties[key].title));

                // NOTE: Due to this bug: https://github.com/zapier/zapier-platform/issues/1178 we're using title property
                // from the input schema as a key for some of the input fields.
                const value = bundle.inputData[fieldKey] ?? bundle.inputData[fieldTitle];
                if (value !== undefined && value !== null) { // NOTE: value can be false or 0, these are legit value.
                    input[key] = processInputField(key, value, inputSchema);
                }
            });
            requestOpts.body = JSON.stringify(input);
            requestOpts.headers = {
                'Content-Type': 'application/json; charset=utf-8',
            };
        } else {
            // This can happen in very rare cases, when user deletes input schema by build actor without schema.
            throw new Error(`It cannot run Actor, the build ${build} has no input schema, but the Zap was set up with it.`);
        }
    }

    // Calling z.generateCallbackUrl() is what pauses the Zap step, so it must not be called when running async.
    if (runSync) {
        requestOpts.params.timeout = Math.min(timeoutSecs || DEFAULT_SYNC_RUN_TIMEOUT_SECS, DEFAULT_SYNC_RUN_TIMEOUT_SECS);
        requestOpts.params.webhooks = buildRunCallbackWebhookParam(z.generateCallbackUrl());
    }

    const { data: run } = await requestActorOrThrowNotFound(z, requestOpts, actorId);

    // The step is paused here and finished by performResume once the run reaches a terminal status.
    if (runSync) return run;

    return enrichActorRun(z, bundle.authData.access_token, run);
};

const resumeActorRun = async (z, bundle) => {
    const run = await getActorRunOnResume(z, bundle, true);
    return enrichActorRun(z, bundle.authData.access_token, run);
};

module.exports = {
    key: 'createActorRun',
    noun: 'Actor Run',
    display: {
        label: 'Run Actor',
        description: 'Runs an Apify Actor (a cloud program for web scraping, data extraction, or automation) with custom input parameters. '
            + 'Use this for ad-hoc runs; if you already have a saved configuration in Apify Console, use Run Task instead. '
            + 'Returns the run ID, status, and default dataset ID; retrieve the results with Fetch Dataset Items, '
            + 'or look up the run later with Find Last Actor Run.',
    },

    operation: {
        inputFields: [
            {
                label: 'Search Actors from',
                helpText: 'Please select the source to search Actors from.',
                key: 'searchLocation',
                required: true,
                type: 'string',
                default: RECENTLY_USED_ACTORS_KEY,
                choices: ACTOR_SEARCH_SOURCES,
                altersDynamicFields: true,
            },
            {
                label: 'Actor',
                helpText: 'Please select the Actor to run, or pass an Actor ID or slug directly (for example `apify~web-scraper`).',
                key: 'actorId',
                required: true,
                dynamic: 'actorsWithStore.id.name',
                altersDynamicFields: true,
            },
            {
                label: 'Run synchronously',
                helpText: 'If you choose `yes`, this step waits until the Actor run finishes and then returns its results. '
                    + 'The Zap shows the step as waiting in the meantime, and the run is limited by the Timeout set below, '
                    + 'at most 1 hour, after which it is stopped. '
                    + 'If you choose `no`, the step returns as soon as the run starts, and you can fetch the results in a later step '
                    + 'with Find Last Actor Run or Fetch Dataset Items, or in a second Zap that starts with the Finished Actor Run trigger.',
                key: 'runSync',
                required: true,
                type: 'boolean',
                default: 'no',
            },
            getActorAdditionalFields,
        ],

        perform: runActor,
        performResume: resumeActorRun,

        sample: ACTOR_RUN_SAMPLE,
        outputFields: [
            ...ACTOR_RUN_OUTPUT_FIELDS,
            getActorDatasetOutputFields,
        ],
    },
};
