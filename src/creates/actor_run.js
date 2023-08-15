const dayjs = require('dayjs');
const { APIFY_API_ENDPOINTS, ACTOR_RUN_SAMPLE, ACTOR_RUN_OUTPUT_FIELDS } = require('../consts');
const {
    enrichActorRun,
    getActorAdditionalFields,
    maybeGetInputSchemaFromActor,
    prefixInputFieldKey,
} = require('../apify_helpers');
const { wrapRequestWithRetries } = require('../request_helpers');

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

    if (runSync) requestOpts.params.waitForFinish = 120;
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
                const value = bundle.inputData[fieldKey];
                if (value) {
                    const { editor, title } = inputSchema.properties[key];
                    if (editor === 'datepicker') {
                        const date = dayjs(value);
                        input[key] = date.format('YYYY-MM-DD');
                    } else if (editor === 'requestListSources') {
                        input[key] = value.map((url) => {
                            return { url: url.trim() };
                        });
                    } else if (editor === 'pseudoUrls') {
                        input[key] = value.map((purl) => {
                            return { purl: purl.trim() };
                        });
                    } else if (editor === 'globs') {
                        input[key] = value.map((glob) => {
                            return { glob: glob.trim() };
                        });
                    } else if (editor === 'proxy' || editor === 'json' || editor === 'keyValue') {
                        try {
                            input[key] = JSON.parse(value);
                        } catch (err) {
                            throw new Error(`${title} is not a valid JSON, please check it. Error: ${err.message}`);
                        }
                    } else {
                        input[key] = value;
                    }
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

    const { data: run } = await wrapRequestWithRetries(z.request, requestOpts);

    return enrichActorRun(z, run);
};

module.exports = {
    key: 'createActorRun',
    noun: 'Actor Run',
    display: {
        label: 'Run Actor',
        description: 'Runs a selected actor.',
    },

    operation: {
        inputFields: [
            {
                label: 'Actor',
                helpText: 'Please select the actor to run.',
                key: 'actorId',
                required: true,
                dynamic: 'actors.id.name',
                altersDynamicFields: true,
            },
            {
                label: 'Run synchronously',
                helpText: 'If you choose `yes`, the Zap will wait until the actor run is finished. '
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
        outputFields: ACTOR_RUN_OUTPUT_FIELDS,
    },
};
