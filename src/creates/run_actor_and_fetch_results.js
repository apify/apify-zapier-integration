const _ = require('lodash');
const {
    ACTOR_SEARCH_SOURCES,
    RECENTLY_USED_ACTORS_KEY,
    RUN_ACTOR_AND_FETCH_RESULTS_SAMPLE,
    RUN_ACTOR_AND_FETCH_RESULTS_OUTPUT_FIELDS,
    RUN_ACTOR_AND_FETCH_RESULTS_DEFAULT_ITEMS_LIMIT,
    DEFAULT_SYNC_RUN_TIMEOUT_SECS,
    OMIT_ACTOR_RUN_FIELDS,
} = require('../consts');
const {
    getActorAdditionalFields,
    buildActorRunRequestOptions,
    requestActorOrThrowNotFound,
    buildRunCallbackWebhookParam,
    getActorRunOnResume,
    getDatasetItems,
} = require('../apify_helpers');
const { waitForRunToFinish, getRemainingTestStepWaitSecs } = require('../request_helpers');
const { getActorDatasetOutputFields } = require('../output_fields');

const buildRunResult = async (z, bundle, run) => {
    const { limit, fields } = bundle.inputData;
    const { defaultDatasetId } = run;

    if (!defaultDatasetId) return { items: [] };

    // NOTE: limit can be legitimately 0 (meaning "no items"), so only substitute the default when it's unset.
    const params = { limit: (limit === undefined || limit === null || limit === '') ? RUN_ACTOR_AND_FETCH_RESULTS_DEFAULT_ITEMS_LIMIT : limit };
    if (fields && fields.length) params.fields = fields.split(',').map((f) => f.trim()).join(',');

    return getDatasetItems(z, defaultDatasetId, bundle.authData.access_token, params, run.actId, true);
};

const getActorAdditionalFieldsForFetchResults = (z, bundle) => getActorAdditionalFields(z, bundle, { hasSyncField: false });

const runActorAndFetchResults = async (z, bundle) => {
    const stepStartedAt = Date.now();
    const { actorId, timeoutSecs } = bundle.inputData;

    const requestOpts = await buildActorRunRequestOptions(z, bundle);
    // Same cap as Run Actor's synchronous path.
    requestOpts.params.timeout = Math.min(timeoutSecs || DEFAULT_SYNC_RUN_TIMEOUT_SECS, DEFAULT_SYNC_RUN_TIMEOUT_SECS);

    // The Zap editor cannot wait for the callback, so a test step waits for the results inline.
    const isTestStep = !!bundle.meta?.isLoadingSample;

    // Calling z.generateCallbackUrl() is what pauses the Zap step, so it must not be called when testing.
    if (!isTestStep) requestOpts.params.webhooks = buildRunCallbackWebhookParam(z.generateCallbackUrl());

    const { data: run } = await requestActorOrThrowNotFound(z, requestOpts, actorId);

    // The step is paused here and finished by performResume once the run reaches a terminal status.
    if (!isTestStep) return _.omit(run, OMIT_ACTOR_RUN_FIELDS);

    const waitedRun = await waitForRunToFinish(z.request, run.id, getRemainingTestStepWaitSecs(stepStartedAt));
    return buildRunResult(z, bundle, waitedRun || run);
};

const resumeRunActorAndFetchResults = async (z, bundle) => {
    const run = await getActorRunOnResume(z, bundle);
    return buildRunResult(z, bundle, run);
};

module.exports = {
    key: 'runActorAndFetchResults',
    noun: 'Actor Results',
    display: {
        label: 'Run Actor and Fetch Results',
        description: 'Runs an Actor and waits for it to finish, then returns the dataset items produced by the run - all in a single step. '
            + 'Best suited for short-running Actors (under 5 minutes) where you need the scraped data immediately. '
            + 'For long-running Actors, use Run Actor (async) + Fetch Dataset Items separately.',
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
            getActorAdditionalFieldsForFetchResults,
            {
                label: 'Limit',
                helpText: 'The maximum number of dataset items to return. Defaults to 10.',
                key: 'limit',
                required: false,
                type: 'integer',
                default: RUN_ACTOR_AND_FETCH_RESULTS_DEFAULT_ITEMS_LIMIT.toString(),
            },
            {
                label: 'Fields',
                helpText: 'Only return these fields in each item, as a comma-separated list (e.g. `title,url,price`). '
                    + 'All other fields will be dropped from the result. Leave empty to return all fields.',
                key: 'fields',
                required: false,
                type: 'string',
            },
        ],

        perform: runActorAndFetchResults,
        performResume: resumeRunActorAndFetchResults,

        sample: RUN_ACTOR_AND_FETCH_RESULTS_SAMPLE,
        outputFields: [
            ...RUN_ACTOR_AND_FETCH_RESULTS_OUTPUT_FIELDS,
            (z, bundle) => getActorDatasetOutputFields(z, bundle, 'items[]'),
        ],
    },
};
