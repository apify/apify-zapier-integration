const dayjs = require('dayjs');
const {
    APIFY_API_ENDPOINTS,
    ACTOR_RUN_SAMPLE,
    ACTOR_RUN_OUTPUT_FIELDS, ACTOR_SEARCH_SOURCES,
    RECENTLY_USED_ACTORS_KEY,
    DEFAULT_RUN_WAIT_TIME_OUT_SECONDS,
} = require('../consts');
const {
    enrichActorRun,
    getActorAdditionalFields,
    maybeGetInputSchemaFromActor,
    prefixInputFieldKey,
    slugifyText,
} = require('../apify_helpers');
const { wrapRequestWithRetries, waitForRunToFinish } = require('../request_helpers');
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
                throw new Error('Please check that your input body is a valid JSON.');
            }
        }
        requestOpts.body = inputBody;
    } else {
        const actorResponse = await wrapRequestWithRetries(z.request, {
            url: `${APIFY_API_ENDPOINTS.actors}/${actorId}`,
        });
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

    let { data: run } = await wrapRequestWithRetries(z.request, requestOpts);
    if (runSync) run = await waitForRunToFinish(z.request, run.id, DEFAULT_RUN_WAIT_TIME_OUT_SECONDS);

    return enrichActorRun(z, bundle.authData.access_token, run);
};

module.exports = {
    key: 'createActorRun',
    noun: 'Actor Run',
    display: {
        label: 'Run Actor',
        description: 'Runs a selected Actor.',
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
                helpText: 'Please select the Actor to run.',
                key: 'actorId',
                required: true,
                dynamic: 'actorsWithStore.id.name',
                altersDynamicFields: true,
            },
            {
                label: 'Run synchronously',
                helpText: 'If you choose `yes`, the Zap will wait until the Actor run is finished. '
                    + 'Beware that the hard timeout for the run is 30 seconds.',
                key: 'runSync',
                required: true,
                type: 'boolean',
                default: 'no',
            },
            getActorAdditionalFields,
        ],

        perform: runActor,

        sample: ACTOR_RUN_SAMPLE,
        outputFields: [
            ...ACTOR_RUN_OUTPUT_FIELDS,
            getActorDatasetOutputFields,
        ],
    },
};
